# Fase 0 — Infraestructura del logger

**Prerrequisitos:** ninguno. Esta es la primera fase.
**Deja andando:** un logger estructurado único, con redacción de secretos, y el access log HTTP
en JSON en lugar de `morgan("dev")`.
**No hace:** migrar los 38 `console.*` (Fase 2) ni tocar auditoría (Fase 3).

Leé [LOGGING_PLAN.md](../LOGGING_PLAN.md) §3 y §4 antes de empezar. Las reglas de privacidad de
§4 definen la mitad del código de esta fase.

---

## 0.1 Instalar dependencias

Antes de instalar, **verificá la mayor estable actual** (este plan se escribió con `pino` 9.x /
`pino-http` 10.x / `pino-pretty` 13.x):

```bash
npm view pino version && npm view pino-http version && npm view pino-pretty version
```

Si la mayor resultó ser más nueva que la de arriba, instalala igual, pero verificá en su changelog
los dos únicos puntos de API que este plan usa: la opción `redact` y la opción `transport`.

```bash
npm install pino pino-http --workspace=backend
```

```bash
npm install -D pino-pretty --workspace=backend
```

`pino-pretty` va en `devDependencies` a propósito: en producción el log es JSON y nunca se carga.

- [ ] `pino` y `pino-http` en `dependencies` de `backend/package.json`
- [ ] `pino-pretty` en `devDependencies`
- [ ] `npm run build --workspace=backend` sigue compilando

---

## 0.2 Variables de entorno

En `backend/src/config/env.ts`, agregar al `schema` de yup (seguí el estilo de los comentarios
existentes: explican el *por qué*, no el *qué*):

```ts
  // Logging (ver LOGGING_PLAN.md). Opcionales con default a propósito: una
  // instalación existente arranca sin tocar su .env.
  LOG_LEVEL: yup
    .string()
    .oneOf(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // `true` activa pino-pretty (salida coloreada para una terminal humana).
  // Default false: en producción el log tiene que ser JSON por línea, que es
  // lo que consume jq/Loki/cualquier agregador. Mismo patrón de parseo de
  // booleano que S3_FORCE_PATH_STYLE.
  LOG_PRETTY: yup
    .boolean()
    .transform((value, originalValue) =>
      typeof originalValue === "string" ? originalValue.toLowerCase() === "true" : Boolean(value),
    )
    .default(false),
```

En `backend/vitest.config.ts`, agregar al bloque `env`:

```ts
      LOG_LEVEL: "silent",
```

> **Por qué importa:** sin esto, cada test que importe código del backend escupe logs y ensucia
> la salida de vitest hasta hacerla ilegible.

- [ ] `LOG_LEVEL` y `LOG_PRETTY` agregadas al schema con su comentario
- [ ] `LOG_LEVEL: "silent"` en `vitest.config.ts`
- [ ] Documentadas en el `.env.example` si existe; si no, en `backend/README.md`

---

## 0.3 `backend/src/config/logger.ts` (archivo nuevo)

```ts
import pino from "pino";
import env from "./env";

/// Único logger de la aplicación. Todo el backend loguea a través de `logger`
/// o de un child suyo — nunca con `console.*` (ver `src/no-console.test.ts`,
/// que falla si aparece uno nuevo).
///
/// Sale por **stdout** a propósito: en producción PM2 es el que escribe y rota
/// los archivos (ver `ecosystem.config.js`). El proceso no decide dónde vive su
/// log — si alguna vez se quiere mandar a un agregador, se conecta ahí sin
/// tocar este archivo.

/// Campos que NUNCA deben aparecer en un log, por más que alguien loguee el
/// objeto entero que los contiene. Es defensa estructural: no depende de que
/// cada call site se acuerde de omitirlos.
///
/// OJO — `redact` solo actúa sobre propiedades de objetos. Una string ya
/// interpolada (`logger.info(\`token: ${t}\`)`) pasa intacta: eso se previene
/// con las reglas de LOGGING_PLAN.md §4, no con esto.
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
];

/// Factory separada del singleton para que los tests puedan construir un logger
/// con destino y nivel propios y assertear sobre la salida real (el singleton
/// está en `silent` durante los tests, ver vitest.config.ts).
export function buildLogger(opts?: { level?: string; destination?: pino.DestinationStream }) {
  const isTest = process.env.NODE_ENV === "test";
  const level = opts?.level ?? (isTest ? "silent" : env.LOG_LEVEL);

  // pino-pretty corre en un worker thread. Bajo vitest eso deja handles
  // abiertos y el runner no termina nunca — de ahí el guard de isTest, además
  // del destino explícito que pasan los tests.
  const usePretty = env.LOG_PRETTY && !isTest && !opts?.destination;

  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
      // ISO-8601 en vez del epoch default de pino: estos logs también los lee
      // gente. Ver `time: false` en ecosystem.config.js — PM2 no debe prefijar
      // su propio timestamp o rompe el JSON por línea.
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(usePretty
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    opts?.destination,
  );
}

export const logger = buildLogger();
```

- [ ] Archivo creado con los comentarios de *por qué* (convención del repo)
- [ ] `logger` exportado como singleton y `buildLogger` como factory testeable

### Tests obligatorios — `backend/src/config/logger.test.ts`

Usar un destino en memoria para capturar la salida real:

```ts
import { describe, expect, it } from "vitest";
import { buildLogger } from "./logger";

function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const logger = buildLogger({
    level: "info",
    destination: { write: (chunk: string) => lines.push(JSON.parse(chunk)) },
  });
  return { logger, lines };
}
```

- [ ] Loguea JSON parseable, con `level` y `time`
- [ ] `time` es ISO-8601, no un epoch numérico
- [ ] **Redacta `req.headers.authorization`** → el valor sale `[Redacted]` y el token no aparece
      en ninguna parte de la línea serializada
- [ ] **Redacta `password` en cualquier nivel** (`{ password }` y `{ body: { password } }`)
- [ ] Respeta el nivel: con `level: "warn"`, un `logger.info()` no emite nada
- [ ] Un child logger (`logger.child({ requestId: "x" })`) propaga el campo a cada línea

---

## 0.4 `backend/src/middlewares/http-logger.middleware.ts` (archivo nuevo)

Reemplaza a `morgan`. Tres cosas importantes acá, en orden de gravedad:

1. **El serializer de `req` tiene que descartar el query string.** Las URLs de contenido de
   archivo son `/v1/files/:id/content?t=<hmac firmado>` (ver `FILE_URL_SIGNING_SECRET` en
   `env.ts`). Loguear la URL completa deja tokens de acceso a archivos en el log — es la misma
   clase de fuga que la de `auth.service.ts`, por otra vía.
2. **Nivel según status**: 5xx → `error`, 4xx → `warn`, resto → `info`. Si todo es `info`, el log
   no se puede filtrar por "cosas que salieron mal".
3. **`GET /` no se loguea**: es el health check y ensucia el log sin aportar nada.

```ts
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import pinoHttp from "pino-http";
import { logger } from "../config/logger";

/// Access log HTTP. Reemplaza a `morgan("dev")`, que emitía un formato pensado
/// para mirar una terminal (coloreado, sin usuario, sin id de correlación) y no
/// servía para filtrar ni alertar en producción.
export const httpLogger = pinoHttp({
  logger,

  /// Un UUID nuevo por request, devuelto también en el header de respuesta para
  /// que un usuario que reporta un error pueda citar el id exacto.
  /// A propósito NO se confía en un `x-request-id` entrante: es input de un
  /// cliente y no aporta nada hoy (el frontend no manda ninguno).
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },

  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  /// El usuario se identifica por UUID interno, nunca por email (LOGGING_PLAN §4.4).
  /// `undefined` en rutas sin autenticar — pino omite los campos undefined.
  customProps: (req) => ({ userId: (req as Request).user?.internalUserId }),

  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      // SOLO el pathname. El query string de /v1/files/:id/content lleva el
      // token HMAC firmado — loguearlo sería filtrar un permiso de acceso.
      url: req.url.split("?")[0],
      // `trust proxy` ya está en 1 (ver app.ts), así que esto es el visitante
      // real y no la IP de Cloudflare.
      ip: (req.raw as Request | undefined)?.ip,
      userAgent: req.headers["user-agent"],
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },

  autoLogging: {
    // GET / es el health check ("Backend is running") — ruido puro.
    ignore: (req) => req.url === "/",
  },
});
```

> **Verificá el shape de `req` en el serializer** contra la versión de `pino-http` que instalaste:
> según la mayor, el objeto que recibe el serializer puede exponer la request de Express como
> `req.raw` o directamente. Si `ip` sale `undefined` en el test de 0.4, ese es el motivo.

En `backend/src/app.ts`:
- Borrar `import morgan from "morgan"` y la línea `app.use(morgan("dev"))`.
- Agregar `app.use(httpLogger)` **en el mismo lugar** (después de `cors`, antes de
  `express.json()`): así una request con body inválido igual queda logueada.
- Desinstalar morgan: `npm uninstall morgan @types/morgan --workspace=backend`.

- [ ] `http-logger.middleware.ts` creado
- [ ] `morgan` reemplazado en `app.ts` y desinstalado del `package.json`
- [ ] El orden de middlewares quedó: `helmet` → `cors` → `httpLogger` → `express.json`

### Tests obligatorios — `backend/src/middlewares/http-logger.middleware.test.ts`

Con `supertest` contra el `app` exportado (mismo patrón que `app.test.ts`):

- [ ] Una respuesta 200 trae un header `x-request-id` con formato UUID
- [ ] Dos requests distintas traen `x-request-id` **distintos**
- [ ] `customLogLevel` devuelve `"error"` para 500, `"warn"` para 404 y `"info"` para 200
      (testeá la función directamente, exportándola si hace falta — no dependas de capturar logs)
- [ ] El serializer de `req` **no** incluye el query string: con
      `url: "/v1/files/abc/content?t=secreto"`, la salida serializada no contiene `secreto`
- [ ] `autoLogging.ignore` devuelve `true` para `/` y `false` para `/api/v1/conversations`

---

## 0.5 Verificación de la fase

```bash
npm run test --workspace=backend
```

```bash
npm run build --workspace=backend
```

Y a ojo, que la salida sea JSON (una línea por request, parseable):

```bash
npm run dev --workspace=backend
```

- [ ] Los tests pasan y la cobertura no bajó de los thresholds de `vitest.config.ts`
- [ ] Con `LOG_PRETTY=false`, cada request emite **una** línea JSON válida
- [ ] Con `LOG_PRETTY=true`, la salida es legible y coloreada
- [ ] Un `GET /` no emite ninguna línea
- [ ] `grep -r "morgan" backend/src backend/package.json` no devuelve nada

Commit sugerido: `feat(backend): logger estructurado con pino y access log JSON`

Al cerrar: marcar la Fase 0 como ✅ en la tabla de [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5 con la
fecha, y correr `/graphify backend/src --update`.
