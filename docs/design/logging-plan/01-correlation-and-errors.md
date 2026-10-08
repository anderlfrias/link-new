# Fase 1 — Contexto de request, correlación y logging de errores

**Prerrequisitos:** Fase 0 cerrada (`logger` y `httpLogger` existen).
**Deja andando:** todo log emitido durante una request, un evento de socket o un tick de worker
sale automáticamente etiquetado con su contexto (`requestId`, `userId`, `socketId`, `worker`), sin
que ningún service tenga que recibir un logger por parámetro. Y el `errorHandler` deja de tirar
`console.error(err)` crudo.
**No hace:** migrar los `console.*` de los módulos (Fase 2) — solo el del `errorHandler`, porque
es parte de rediseñarlo.

> **Esta fase construye la pieza que también usa la Fase 3.** El contexto no transporta solo el
> logger: transporta además `ip`, `userAgent` y `actorEmail`, que son exactamente los campos que
> le faltan hoy a las filas de auditoría. Por eso el archivo se llama `request-context.ts` y no
> `log-context.ts`. **No lo recortes** a "solo el logger" pensando que simplificás: la Fase 3
> tendría que rehacerlo, o peor, cambiar la firma de las ~10 funciones de service que hoy
> auditan.

---

## 1.1 Por qué `AsyncLocalStorage` y no pasar el contexto por parámetro

La alternativa obvia —`logger` (o `ctx`) como primer argumento de cada función— obliga a cambiar la
firma de controller → service → repository en los 9 módulos, y a que un `file.service.ts` llamado
desde un worker acepte un contexto de request que en ese caso no existe. `AsyncLocalStorage` (de
`node:async_hooks`, sin dependencias) resuelve eso: el contexto se establece una vez en el borde
(middleware HTTP, middleware de socket, tick de worker) y cualquier `getLogger()` /
`getRequestMeta()` río abajo lo encuentra.

Concretamente, para la Fase 3 esto significa que `conversation.service.ts#createConversation` va a
poder registrar la IP del actor **sin cambiar su firma ni la de su controller ni sus tests**.

**Limitación a conocer antes de debuggear algo raro:** el contexto se propaga por la cadena de
`await`/callbacks, pero **se pierde** si algo sale de esa cadena — típicamente un listener
registrado una sola vez al arrancar (`setInterval`, un `EventEmitter` global) que después dispara
fuera de toda request. En esos casos `getLogger()` devuelve el logger raíz sin `requestId` y
`getRequestMeta()` devuelve `{}`, que es exactamente lo correcto: esa ejecución *no* pertenece a
ninguna request. Por eso los workers establecen su propio contexto (§1.5).

---

## 1.2 `backend/src/config/request-context.ts` (archivo nuevo)

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";
import { logger as rootLogger } from "./logger";

/// Datos ambientales de la petición en curso. Los consumen dos cosas distintas:
/// el logger (para etiquetar cada línea) y el audit trail (para registrar desde
/// dónde se hizo una acción — ver LOGGING_PLAN.md §2.2 problema 3).
///
/// Todos opcionales a propósito: un tick de worker no tiene IP ni actor, y un
/// socket no tiene requestId HTTP.
export type RequestMeta = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
  /// UUID interno del actor (tabla `User`). Lo consume el audit trail como
  /// default de `userId`, para que auditar una acción no obligue a cambiar la
  /// firma del service que la ejecuta (ver Fase 3).
  actorUserId?: string;
  /// Identidad del actor tal como la presentó. Va al audit trail, nunca a un
  /// log de aplicación (LOGGING_PLAN.md §4.4).
  actorEmail?: string;
};

/// El store es mutable a propósito (ver `bindContext`): el usuario no se conoce
/// cuando arranca la request — recién aparece después de `authenticate` y
/// `attachInternalUser`.
type RequestContext = { logger: Logger; meta: RequestMeta };

const storage = new AsyncLocalStorage<RequestContext>();

/// Abre un contexto para todo lo que pase abajo (incluidos los `await`
/// encadenados). Usado por los tres bordes de entrada: middleware HTTP,
/// middleware de socket y tick de worker.
export function runWithContext<T>(logger: Logger, meta: RequestMeta, fn: () => T): T {
  return storage.run({ logger, meta }, fn);
}

/// Agrega campos al contexto actual: `logFields` al logger (aparecen en cada
/// línea posterior) y `meta` a los datos ambientales. No-op si no hay contexto
/// (ej. código llamado desde un test unitario o al arrancar el proceso).
export function bindContext(opts: { logFields?: Record<string, unknown>; meta?: RequestMeta }): void {
  const store = storage.getStore();
  if (!store) return;
  if (opts.logFields) {
    store.logger = store.logger.child(opts.logFields);
  }
  if (opts.meta) {
    store.meta = { ...store.meta, ...opts.meta };
  }
}

/// El logger del contexto actual, o el raíz si no hay ninguno. Nunca devuelve
/// undefined a propósito: un service no debería tener que saber si lo llamó una
/// request HTTP, un socket o un worker para poder loguear.
export function getLogger(): Logger {
  return storage.getStore()?.logger ?? rootLogger;
}

/// Los datos ambientales del contexto actual, o `{}` fuera de todo contexto.
/// La Fase 3 lo usa para completar `ip`/`userAgent`/`requestId` de cada fila de
/// auditoría sin cambiar la firma de ningún service.
export function getRequestMeta(): RequestMeta {
  return storage.getStore()?.meta ?? {};
}
```

- [x] Archivo creado

### Tests obligatorios — `backend/src/config/request-context.test.ts`

- [x] `getLogger()` sin contexto devuelve el logger raíz (no tira, no es `undefined`)
- [x] `getRequestMeta()` sin contexto devuelve `{}`
- [x] Dentro de `runWithContext(child, meta, ...)`, `getLogger()` devuelve ese child y
      `getRequestMeta()` devuelve ese meta
- [x] El contexto **sobrevive un `await`**: `await runWithContext(l, {}, async () => { await tick(); return getLogger(); })` sigue devolviendo `l`
- [x] Dos `runWithContext` concurrentes (`Promise.all`) **no se contaminan** entre sí — cada uno ve
      su propio logger y su propio meta. Este es el test que importa: es la propiedad que
      justifica usar ALS en lugar de una variable de módulo.
- [x] `bindContext({ logFields })` afecta a los `getLogger()` posteriores del mismo contexto
- [x] `bindContext({ meta })` **mergea** sobre el meta existente, no lo reemplaza
- [x] `bindContext` fuera de todo contexto no tira

---

## 1.3 Middleware HTTP — `backend/src/middlewares/request-context.middleware.ts` (archivo nuevo)

```ts
import type { NextFunction, Request, Response } from "express";
import { runWithContext } from "../config/request-context";
import { logger } from "../config/logger";

/// Abre el contexto de la request. Debe montarse DESPUÉS de `httpLogger`: el
/// `requestId` lo genera ese middleware (`req.id`), y acá solo se hereda para
/// que toda línea emitida río abajo se pueda atar a la misma request.
///
/// `req.ip` es el visitante real y no la IP de Cloudflare gracias a
/// `app.set("trust proxy", 1)` (ver app.ts) — de ahí que valga la pena
/// guardarlo en el audit trail.
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  const requestId = (req as Request & { id?: string }).id;
  const child = logger.child({ requestId });
  runWithContext(
    child,
    { requestId, ip: req.ip, userAgent: req.headers["user-agent"] },
    () => next(),
  );
}
```

En `backend/src/app.ts`, montarlo inmediatamente después de `httpLogger`:

```ts
app.use(httpLogger);
app.use(requestContext);
```

Y en `backend/src/middlewares/current-user.middleware.ts`, dentro de `attachInternalUser`, después
de asignar `req.user.internalUserId`:

```ts
    req.user.internalUserId = user.id;
    // A partir de acá toda línea de log de esta request lleva el usuario, y el
    // audit trail puede registrar la identidad del actor sin que ningún service
    // reciba un parámetro nuevo. En el log va el UUID y no el email
    // (LOGGING_PLAN.md §4.4); el email va solo al meta, que consume el audit.
    bindContext({
      logFields: { userId: user.id },
      meta: { actorUserId: user.id, actorEmail: user.email },
    });
```

- [x] `request-context.middleware.ts` creado y montado justo después de `httpLogger`
- [x] `bindContext` agregado en `attachInternalUser`

### Tests obligatorios

- `request-context.middleware.test.ts`:
  - [x] Llama a `next()` exactamente una vez
  - [x] Dentro de `next()`, `getLogger()` devuelve un logger distinto del raíz
  - [x] Dentro de `next()`, `getRequestMeta()` trae `ip`, `userAgent` y `requestId` de la request
- Extender `current-user.middleware.test.ts` (ya existe):
  - [x] Con usuario encontrado, se llamó a `bindContext` con `logFields.userId` = UUID interno y
        `meta` con `actorUserId` = UUID interno y `actorEmail` = email del usuario
  - [x] Con usuario **no** encontrado (`UnauthorizedError`), **no** se llamó a `bindContext`

---

## 1.4 Contexto en Socket.IO

`backend/src/socket/middleware.ts` ya reserva el lugar: su comentario lista los middlewares
globales previstos y el **4 es "logging"**. Esta fase lo llena.

**Ojo con un detalle de Socket.IO:** un middleware de `io.use()` corre **una vez por conexión**, no
por evento. El contexto de `AsyncLocalStorage` abierto ahí **no** llega a los handlers de eventos
posteriores (cada evento entra por un callback de I/O nuevo). Por eso son dos piezas:

1. Un middleware que **adjunta** el contexto al socket (`socket.data.logger` + `socket.data.meta`).
2. Un wrapper que **abre** ese contexto en cada handler de evento.

### `backend/src/socket/request-context.ts` (archivo nuevo)

```ts
import { runWithContext, type RequestMeta } from "../config/request-context";
import { logger } from "../config/logger";
import { AppSocket, AuthenticatedSocketUser, SocketMiddleware } from "./types";

/// Middleware global (posición 4 de la cadena, ver middleware.ts): adjunta a
/// cada socket su logger y su meta. No abre contexto de AsyncLocalStorage — un
/// io.use() corre una vez por conexión, no por evento; para eso está
/// `withRequestContext`.
export const attachSocketContext: SocketMiddleware = (socket, next) => {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  socket.data.logger = logger.child({ socketId: socket.id, userId: user?.internalUserId });
  socket.data.meta = {
    // El equivalente de req.ip para un socket. `handshake.address` respeta el
    // mismo trust proxy que Express (ver gateway.ts / app.ts).
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers["user-agent"],
    actorUserId: user?.internalUserId,
    actorEmail: user?.email,
  } satisfies RequestMeta;
  next();
};

/// Envuelve un handler de evento para que todo lo que loguee o audite río abajo
/// lleve el contexto del socket. Se usa al registrar cada listener en un
/// *.socket.ts:
///
///   socket.on(MESSAGE_EVENTS.TYPING, withRequestContext(socket, (payload) => ...));
export function withRequestContext<A extends unknown[]>(
  socket: AppSocket,
  handler: (...args: A) => void | Promise<void>,
): (...args: A) => void {
  return (...args: A) => {
    const socketLogger = socket.data.logger ?? logger;
    const meta = (socket.data.meta ?? {}) as RequestMeta;
    void runWithContext(socketLogger, meta, () => handler(...args));
  };
}
```

Declarar `logger` y `meta` en el tipo de `socket.data` en `backend/src/socket/types.ts` (con su
comentario de por qué, como el resto de ese archivo), y registrar el middleware en `middleware.ts`:

```ts
export const socketMiddlewares: SocketMiddleware[] = [authenticateSocket, attachSocketContext];
```

> Orden: **después** de `authenticateSocket`, porque necesita `socket.data.user` para etiquetar
> con `userId` y `actorEmail`. Actualizá el comentario numerado de `middleware.ts` para reflejar
> que el punto 4 ya está hecho.

- [x] `socket/request-context.ts` creado
- [x] `attachSocketContext` agregado a `socketMiddlewares` después de `authenticateSocket`
- [x] Comentario de la cadena de middlewares actualizado (el punto 4 ya no es "a futuro")
- [x] `socket.data.logger` y `socket.data.meta` declarados en `types.ts`
- [x] Los handlers existentes de `conversation.socket.ts` y `message.socket.ts` envueltos en
      `withRequestContext` (`presence.socket.ts` hoy no registra listeners, solo hace el join — no
      necesita cambio)

### Tests obligatorios — `backend/src/socket/request-context.test.ts`

- [x] `attachSocketContext` deja `socket.data.logger` y `socket.data.meta` definidos y llama a `next()`
- [x] Con `socket.data.user` presente, el child se creó con `userId` y `socketId`, y el meta trae
      `actorUserId` y `actorEmail`
- [x] Sin `socket.data.user` (socket sin autenticar), no tira y `userId`/`actorUserId`/`actorEmail`
      quedan `undefined`
- [x] El meta trae `ip` y `userAgent` tomados del `handshake`
- [x] `withRequestContext` invoca el handler con los mismos argumentos que recibió
- [x] Dentro del handler, `getLogger()` devuelve `socket.data.logger` y `getRequestMeta()` el meta
- [x] Si `socket.data.logger` no está seteado, `withRequestContext` cae al logger raíz sin tirar

---

## 1.5 Contexto en los workers

Los tres workers (`message-retention`, `upload-cleanup`, `file-migration`) corren en
`setInterval`, fuera de toda request. Cada pasada debe abrir su propio contexto para que sus líneas
sean agrupables y distinguibles entre sí.

`backend/src/workers/worker-context.ts` (archivo nuevo):

```ts
import { randomUUID } from "node:crypto";
import { runWithContext } from "../config/request-context";
import { logger } from "../config/logger";

/// Abre un contexto de logging por pasada de worker. `tickId` permite agrupar
/// todas las líneas de una misma pasada, que es la unidad que importa cuando
/// una limpieza procesa 50 archivos y 3 fallan.
///
/// El meta va vacío a propósito: una pasada de worker no tiene IP ni actor
/// humano. Si un worker alguna vez audita algo, esa fila debe quedar sin `ip`
/// y sin `userId` — es correcto, la hizo el sistema y no una persona.
export function runWorkerTick(worker: string, fn: () => Promise<void>): Promise<void> {
  return runWithContext(logger.child({ worker, tickId: randomUUID() }), {}, fn);
}
```

Y en cada worker, envolver la función de barrido en el `setInterval` **y** en la llamada inicial.
Ej. en `message-retention.worker.ts`:

```ts
export function startMessageRetentionWorker(): void {
  void runWorkerTick("message-retention", runRetentionSweep);
  setInterval(() => {
    void runWorkerTick("message-retention", runRetentionSweep);
  }, SWEEP_INTERVAL_MS);
}
```

- [x] `worker-context.ts` creado
- [x] Los 3 workers envueltos (llamada inicial **y** el `setInterval` de cada uno)

### Tests obligatorios — `backend/src/workers/worker-context.test.ts`

- [x] Dentro de `fn`, `getLogger()` no es el logger raíz
- [x] Dentro de `fn`, `getRequestMeta()` devuelve `{}` (sin IP ni actor)
- [x] Dos llamadas seguidas generan `tickId` distintos
- [x] Si `fn` rechaza, la promesa de `runWorkerTick` rechaza (no se traga el error en silencio)

---

## 1.6 Rediseñar el `errorHandler`

`backend/src/middlewares/error.middleware.ts` hoy hace `console.error(err)` solo para el caso 500 y
no registra nada de los 4xx.

```ts
import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { getLogger } from "../config/request-context";
import { AppError } from "../utils/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const log = getLogger();

  if (err instanceof AppError) {
    // Un 4xx no es un bug del server (un 403 es el sistema funcionando), así
    // que va en warn y sin stack. Un AppError 5xx sí — ServiceUnavailableError
    // significa que el proveedor externo o Giphy no responden, y ahí el stack importa.
    if (err.statusCode >= 500) {
      log.error({ err, statusCode: err.statusCode }, "request failed");
    } else {
      log.warn({ statusCode: err.statusCode, error: err.name, reason: err.message }, "request rejected");
    }
    return res.status(err.statusCode).json({ error: err.message });
  }

  // multer valida tamaño/cantidad de archivos antes de que file.route.ts vea el
  // request — sus errores nunca pasan por un AppError, hay que traducirlos acá.
  if (err instanceof MulterError) {
    log.warn({ statusCode: 400, error: err.name, reason: err.message, field: err.field }, "upload rejected");
    return res.status(400).json({ error: err.message });
  }

  // Lo único verdaderamente inesperado: acá sí va el stack completo.
  log.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
```

> **No "arregles" la aparente duplicación.** `httpLogger` (Fase 0) emite su propia línea al
> completarse la request, con método, URL, status y duración. Esta emite el *motivo*. Son dos
> líneas por error a propósito, atadas por el mismo `requestId`: una dice *qué* devolvió la API,
> la otra *por qué*. Colapsarlas obliga a elegir entre perder el timing o perder el stack.

- [x] `errorHandler` reescrito
- [x] Ya no queda ningún `console.` en `error.middleware.ts`
- [x] El **mensaje que sale al cliente no cambió** en ninguno de los tres caminos (es API pública,
      ver `backend/API.md`)

### Tests obligatorios — extender `error.middleware.test.ts` (ya existe)

Mockear `getLogger` con `vi.mock("../config/request-context")` devolviendo un logger espía.

- [x] `AppError` 4xx → status y body iguales a los de antes, y se logueó en **`warn`**
- [x] `AppError` 5xx (`ServiceUnavailableError`) → se logueó en **`error`** con el `err` incluido
- [x] `MulterError` → 400, body con el mensaje de multer, log en `warn`
- [x] Error desconocido (`new Error("boom")`) → 500, body **genérico**
      (`{ error: "Internal server error" }`, nunca el mensaje interno), log en `error`
- [x] El log de un 4xx **no** incluye stack

---

## 1.7 Verificación de la fase

```bash
npm run test --workspace=backend
```

```bash
npm run build --workspace=backend
```

A ojo, con el server levantado: provocar un 404 (`curl localhost:4000/api/v1/nope`) y verificar que
las dos líneas emitidas comparten el mismo `requestId`, y que ese `requestId` coincide con el
header `x-request-id` de la respuesta.

- [x] Tests en verde, cobertura sobre los thresholds
- [x] Mismo `requestId` en las dos líneas de un error y en el header de respuesta
- [x] Una línea de worker lleva `worker` y `tickId`, y **no** lleva `requestId`
- [x] Una request autenticada emite líneas con `userId` después de `attachInternalUser`

Commit sugerido: `feat(backend): contexto de request con correlacion de logs`

Al cerrar: marcar la Fase 1 ✅ en [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5 y correr
`/graphify . --update`.
