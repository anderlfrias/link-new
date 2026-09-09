# Checklist — Backend (Fases 1 a 8)

> Prerequisito: [Fase 0](00-infrastructure-setup.md) cerrada. Protocolo general y
> convenciones en [TESTING_PLAN.md](../TESTING_PLAN.md) — leelo primero si no lo
> hiciste. Invariantes de negocio obligatorias en la sección 4 de ese documento.

Cómo correr un archivo puntual mientras escribís:

```bash
cd backend && npx vitest run src/modules/conversations/conversation.service.test.ts
```

Cheatsheet de mocking (repetido en cada fase donde aplica, para no tener que saltar
de ida y vuelta a esta sección):

- **Repositorio en un test de service**: `vi.mock("./x.repository")` +
  `vi.mocked(XRepository.metodo).mockResolvedValue(...)`.
- **`fetch` global** (EXTERNAL_AUTH en auth, Giphy): `vi.stubGlobal("fetch", vi.fn())` en un
  `beforeEach`, `vi.unstubAllGlobals()` en `afterEach`.
- **Socket.IO** (`getIO()` usado en conversation/message service): `vi.mock("../../socket", () => ({ getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() })) }))`.
- **`jsonwebtoken`**: no mockear la librería en sí — es determinística y barata; usar
  un secret de test real (ya seteado en `vitest.config.ts`, Fase 0) y firmar/verificar
  tokens de verdad en el test.

---

<a id="fase-1"></a>

## Fase 1 — Fundamentos (utils, middlewares, config)

Base de todo lo demás: son los archivos que casi todas las rutas atraviesan. Sin
sorpresas de dominio, pero de alto impacto si se rompen (un bug acá afecta TODAS las
rutas, no un módulo).

- [ ] `backend/src/utils/errors.ts` — cada clase (`AppError`, `BadRequestError`,
      `ForbiddenError`, `NotFoundError`, `ServiceUnavailableError`, `UnauthorizedError`):
      `statusCode` y `name` correctos, `message` se propaga.
- [ ] `backend/src/middlewares/auth.middleware.ts` — `authenticate`: sin header → 401
      `UnauthorizedError`; header sin `"Bearer "` → 401; token inválido → 401; token
      expirado (forzar un JWT ya vencido) → 401 "Token expired" específicamente (hay
      un branch dedicado para `TokenExpiredError`); token válido → `req.user` seteado
      con el resultado de `mapTokenToUser`. `requireRoles(...roles)`: usuario sin
      ninguno de los roles pedidos → 403; con al menos uno → pasa.
- [ ] `backend/src/middlewares/current-user.middleware.ts` — leé el archivo antes de
      escribir el test; cubrí el caso "usuario no existe todavía en la DB local" si
      aplica (según lo que haga, puede depender de un repositorio a mockear).
- [ ] `backend/src/middlewares/validate.middleware.ts` — body que cumple el schema
      `yup` pasa sin tocar `res`; body inválido → 400 con el detalle de qué campo
      falló (no un mensaje genérico).
- [ ] `backend/src/middlewares/rate-limit.middleware.ts` — si exporta una factory de
      config (no un limiter ya instanciado corriendo), testear que los valores
      (ventana, máximo, mensaje) son los esperados. Si es solo instancias de
      `express-rate-limit` sin lógica propia, marcar como opcional y anotar por qué
      se salteó.
- [ ] `backend/src/middlewares/error.middleware.ts` — un `AppError` conocido (ej.
      `NotFoundError`) responde con su `statusCode` y `message`; un `Error` genérico
      no reconocido responde 500 con un mensaje genérico, **sin filtrar el stack ni el
      mensaje interno** al cliente.
- [ ] `backend/src/config/cors-origins.ts` — origin en la lista permitida → callback
      sin error; origin no permitido → callback con error; `CORS_ORIGIN` sin definir
      (caso "abierto a cualquier origen", documentado en `config/env.ts`) → todo
      origin pasa.

No testear `backend/src/config/env.ts` directamente (side-effect de `process.exit` es
justamente lo que la Fase 0 ya neutralizó con env vars dummy — envolverlo en un test
propio no suma nada).

---

<a id="fase-2"></a>

## Fase 2 — Auth (seguridad crítica — prioridad alta)

Ver invariante obligatoria en `TESTING_PLAN.md` sección 4 sobre el mensaje 403 genérico
de EXTERNAL_AUTH: no te la saltees.

- [ ] `backend/src/modules/auth/jwt.ts` — `sign`/`verify` (nombres exactos: leer el
      archivo) round-trip; `mapTokenToUser` mapea el payload a la forma esperada;
      `buildFullName` con nombre/apellido presentes/ausentes.
- [ ] `backend/src/modules/auth/auth.service.ts#login` — mockeando `fetch` global:
      credenciales correctas → devuelve token; EXTERNAL_AUTH responde 403 → mensaje genérico
      (**no** debe distinguir "user no existe" de "password incorrecta" en el mensaje);
      `fetch` tira (red caída) o hace timeout (mock que nunca resuelve +
      `AbortController`) → `ServiceUnavailableError`; EXTERNAL_AUTH responde con body no-JSON
      → no explota, se resuelve según el status HTTP igual.
- [ ] `backend/src/modules/auth/auth.repository.ts` — solo si `upsertUserFromExternalUser` u
      otra función tiene lógica condicional real (ej. decidir crear vs. actualizar).
      Si es un wrapper 1:1 de Prisma, opcional (ver criterio general en
      `TESTING_PLAN.md` sección 3).
- [ ] `backend/src/modules/auth/auth.controller.ts` — mapea el resultado/errores del
      service a códigos HTTP correctos (mockeando `auth.service`).
- [ ] `backend/src/modules/auth/auth.validator.ts` — schemas de login/perfil/preferencias:
      payload válido pasa, campos faltantes o de tipo incorrecto rechazan.

---

<a id="fase-3"></a>

## Fase 3 — Conversations (núcleo del dominio — prioridad alta)

`conversation.service.ts` es el nodo más conectado del grafo de este proyecto
(`assertMembership` sola tiene 12 conexiones) — es la superficie con más blast radius
si se rompe. Dedicarle el tiempo que haga falta, no apurar esta fase.

- [ ] `assertMembership()` — miembro de una conversación activa → devuelve la
      conversación; no-miembro → `ForbiddenError`; conversación no existe o está
      borrada → `NotFoundError`. **Invariante obligatoria**, ver sección 4 de
      `TESTING_PLAN.md`.
- [ ] `computeReceipts()` — mensaje sin lectores → todos `"sent"`; `lastReadAt` >=
      `createdAt` del mensaje → `"read"`; solo `lastDeliveredAt` >= `createdAt` →
      `"delivered"`; el propio autor del mensaje se excluye del resultado.
- [ ] `aggregateReceiptStatus()` — vacío → `"sent"`; todos `"read"` → `"read"`; todos
      `"read"` o `"delivered"` (mezcla) → `"delivered"`; al menos uno en `"sent"` →
      `"sent"`. **Invariante obligatoria**.
- [ ] `buildLastMessagePreview()` — mensaje borrado (con `deletedAt`) → siempre
      `"Mensaje eliminado"` **aunque `content` tenga texto real**; sin `deletedAt`,
      con texto → texto con whitespace colapsado a un solo espacio; sin texto pero con
      archivos → `"📎 Archivo adjunto"`; sin texto y sin archivos → string vacío.
      **Invariante obligatoria**.
- [ ] Lógica de permisos de grupo (`assertGroupPermission` u equivalente — confirmar
      nombre exacto leyendo el archivo): owner/admin de grupo/miembro raso, y el caso
      **`allowGroupDelete` apagado rechaza incluso a un admin de la app**.
      **Invariante obligatoria** — no te la saltees, es la que más fácil se rompe sin
      darse cuenta al tocar permisos.
- [ ] `conversation.repository.ts` — solo funciones con lógica condicional real (where
      dinámico, agregaciones). CRUD directo queda opcional.
- [ ] `conversation.controller.ts` — mapeo service → HTTP (mockeando el service).
- [ ] `conversation.validator.ts` — `createConversationSchema`, `updateConversationSchema`,
      `addMembersSchema`, `setFavoriteSchema`, `setPinnedSchema`, `setMemberAdminSchema`,
      `markReadSchema`, `updateGroupSettingsSchema`: un caso válido y un caso inválido
      por schema, no hace falta exhaustividad total por campo.
- [ ] `conversation.socket.ts` — extraer los handlers de evento como funciones testeables
      con un mock de `socket`/`io` (objetos con `emit`/`to`/`on` como `vi.fn()`); no
      levantar un servidor socket.io real para esto.

---

<a id="fase-4"></a>

## Fase 4 — Messages (prioridad alta)

- [ ] `sendMessage()` — creación + entrega vía socket (mockeando `getIO`); mensaje con
      reply (`replyTo`) referencia el original; mensaje tipo `STICKER`/GIF (ver
      `MessageType.STICKER`, viaja como `TEXT` normal con `fileId`, según lo
      documentado — confirmar leyendo el service antes de asumir).
- [ ] `forwardMessage()` — reenvía a otra conversación de la que el usuario sí es
      miembro; reenviar a una de la que NO es miembro → rechazado (usa
      `assertMembership` de conversations, mockeada acá).
- [ ] `listMessages()` — paginación (revisar el mecanismo real: cursor/offset, leer el
      archivo).
- [ ] `listConversationFiles()` — filtra correctamente mensajes con archivos adjuntos.
- [ ] `editMessage()` — autor edita dentro de la ventana de tiempo → OK; no-autor →
      `ForbiddenError` (vía `assertOwnedMessage`, privada — no importar directo, cubrir
      a través de `editMessage`); fuera de la ventana de tiempo
      (`messageEditTimeLimitMinutes`) → rechazado. **Invariante obligatoria**, ver
      sección 4 de `TESTING_PLAN.md`.
- [ ] `deleteMessage()` — mismo criterio que `editMessage` pero con
      `messageDeleteForEveryoneTimeLimitMinutes`; verificar que el contenido no se
      borra de la DB (soft delete) aunque el preview lo oculte (eso ya se cubre en la
      Fase 3 vía `buildLastMessagePreview`, acá solo verificar que `deleteMessage`
      efectivamente marca `deletedAt` y no hace un delete físico — leer el repository
      para confirmar el mecanismo antes de asumir).
- [ ] `message.repository.ts` — igual criterio que conversations: solo lógica
      condicional real.
- [ ] `message.controller.ts` — mapeo service → HTTP.
- [ ] `message.validator.ts` — schemas de crear/editar/reenviar.
- [ ] `message.socket.ts` — handlers de `typing`/`relayTyping()` y demás eventos, como
      funciones puras con mocks de socket/io.

---

<a id="fase-5"></a>

## Fase 5 — Files & Storage

- [ ] `file.service.ts` — validación de mime type contra
      `backend/src/constants/allowed-file-types.constant.ts`; archivo que excede
      `ABSOLUTE_MAX_UPLOAD_BYTES` o el límite configurable
      (`AppSettings.maxUploadSizeMb`) → rechazado. Nota de sync: si tocás esta
      validación, la Fase 14 (frontend) tiene el espejo cliente — dejar comentado en
      el test que ambos lados deben coincidir (ver invariante en `TESTING_PLAN.md`
      sección 4).
- [ ] `file.repository.ts#aggregateFilesForAdmin` — vía la función pública (el helper
      `buildAdminFileWhere` es privado, no se importa directo): filtro por categoría,
      por rango de fechas, sin filtros (trae todo).
- [ ] `file.controller.ts` — mapeo service → HTTP, incluyendo el flujo de upload
      (`multer` ya parseó `req.file`, no hace falta testear multer en sí).
- [ ] `backend/src/storage/local-disk.storage.ts` — **este sí conviene testear con I/O
      real** (no es una dependencia externa, es filesystem local determinístico): usar
      un directorio temporal (`fs.mkdtempSync(path.join(os.tmpdir(), ...))`) en vez de
      `UPLOADS_ROOT` real; guardar un archivo y verificar que existe con el contenido
      correcto; borrar y verificar que desaparece. Limpiar el directorio temporal en
      `afterEach`.
- [ ] `backend/src/storage/index.ts` — si expone algo más que un re-export (ej.
      selección de provider), testear esa lógica; si es solo wiring, opcional.

---

<a id="fase-6"></a>

## Fase 6 — Settings & permisos de grupo

- [ ] `settings.service.ts#getSettings` / `getPublicSettings` — el segundo expone solo
      el subconjunto público (verificar que campos sensibles/admin-only no aparecen en
      el resultado de `getPublicSettings`).
- [ ] `settings.service.ts#updateSettings` — actualiza y persiste vía repository
      (mockeado).
- [ ] `settings.service.ts#resolveEffectiveGroupSettings` — merge de `AppSettings`
      globales + override de grupo: cuando el grupo no tiene override, prevalece el
      valor global; cuando sí lo tiene y el flag está en la lista de
      `getGroupOverrideAllowedFlags()`, prevalece el override; si el flag NO está en
      esa lista permitida, el override se ignora (si esto es lo que hace el código —
      confirmarlo leyendo la función antes de escribir el test, no asumir).
- [ ] `settings.service.ts#getGroupOverrideAllowedFlags` — devuelve exactamente el set
      esperado de flags overrideables.
- [ ] `settings.repository.ts` — opcional salvo lógica condicional real.
- [ ] `settings.controller.ts` — mapeo service → HTTP, incluyendo que la ruta pública
      (`/settings/public`) no exige rol admin y la de `/admin/settings` sí.
- [ ] `settings.validator.ts` — schema de `updateGroupSettingsSchema` y el de
      `PATCH /admin/settings`.

---

<a id="fase-7"></a>

## Fase 7 — Users, Push, Giphy

**Users**
- [ ] `user.service.ts` — lógica de negocio propia del módulo (leer el archivo; si es
      mayormente delegación al repository, priorizar los casos con lógica real).
- [ ] `user.repository.ts#findAllForAdmin` / `#countAllForAdmin` — vía las funciones
      públicas (el helper de armado de `where`, si es privado, no se importa directo):
      filtros combinados, paginación por `beforeId`/`limit`.
- [ ] `user.controller.ts` — mapeo service → HTTP.

**Push**
- [ ] `push.service.ts` — mockear la librería `web-push` (`vi.mock("web-push")`); envío
      exitoso vs. suscripción inválida/expirada (¿el código limpia la suscripción vieja
      de la DB en ese caso? confirmar leyendo el archivo).
- [ ] `push.repository.ts` — opcional salvo lógica condicional real.
- [ ] `push.controller.ts` — `subscribe()` guarda la suscripción; `getVapidPublicKey()`
      devuelve la key configurada.

**Giphy**
- [ ] `giphy.service.ts#importGiphyAsset` — **`originalUrl` con host que NO matchea
      `*.giphy.com` (https) → rechazado antes de intentar descargar.** Invariante
      obligatoria, ver sección 4 de `TESTING_PLAN.md` — este es el caso de seguridad
      más importante de todo el módulo, no lo trates como un edge case más.
- [ ] `giphy.service.ts#searchGiphy` / `#getTrendingGiphy` — mockeando `fetch` a la API
      de Giphy; `GIPHY_API_KEY` no configurada → 503 (`ServiceUnavailableError`) **sin
      tumbar el server** (a diferencia de las VAPID keys, que si faltan cortan el
      arranque — es opcional a propósito, ver `config/env.ts`).
- [ ] `giphy.controller.ts` — mapeo a HTTP, incluyendo el 503 de arriba.
- [ ] `giphy.validator.ts` — schema de búsqueda/import.

---

<a id="fase-8"></a>

## Fase 8 — Socket gateway & Presence

Esta fase testea el "plumbing" de sockets, no la lógica de negocio de cada módulo (esa
ya se cubrió en Fases 3/4 para conversations/messages).

- [ ] `backend/src/socket/gateway.ts` — `createSocketGateway`/`attachSocketModules`:
      cada módulo registrado se attachea sin pisar a los demás.
- [ ] `backend/src/socket/middleware.ts#applyMiddlewares` — se aplican en el orden
      correcto, un middleware que llama a `next(error)` corta la cadena.
- [ ] `backend/src/socket/registry.ts#registerSocketModule` — registrar dos módulos con
      el mismo nombre (si el registry lo previene) o simplemente que ambos queden
      accesibles (si no lo previene — confirmar comportamiento real leyendo el archivo,
      no asumir que hay una validación de duplicados si no la hay).
- [ ] `backend/src/socket/rooms.ts` — `conversationRoomName()`/`userRoomName()`:
      funciones puras, formato de string exacto — test rápido y de alto valor
      (cualquier typo acá rompe el enrutamiento de eventos en silencio).
- [ ] `backend/src/socket/socket-auth.middleware.ts` — mismo criterio que
      `auth.middleware.ts` (Fase 1) pero operando sobre `socket.handshake` en vez de
      `req`: token ausente/inválido/expirado → conexión rechazada; válido →
      `socket.data.user` seteado.
- [ ] `backend/src/modules/presence/presence.socket.ts#registerPresenceSocket` —
      conexión de un usuario → aparece en `getConnectedUserIds()`; desconexión → ya no
      aparece; `joinUser`/`leaveUser` unen/salen del room personal
      (`user:<internalUserId>`).
- [ ] `backend/src/app.ts` — smoke test con `supertest` importando el `app` exportado
      (no `server.ts`, ese hace `listen()` real): `GET /` → 200 "Backend is running";
      una ruta bajo `/api` sin token → 401; `GET /uploads/<algo-inexistente>` → el
      header `Cross-Origin-Resource-Policy: cross-origin` está presente (es el punto
      específico que el comentario en `app.ts` explica que se relajó a propósito solo
      para esta ruta).

---

## Definition of Done — Backend completo (Fases 1–8)

- [ ] Las 8 fases de este archivo tienen todos sus checkboxes en `[x]`.
- [ ] `npm run test --workspace=backend` pasa completo, sin tests skippeados sin
      justificación.
- [ ] Cada fase cerrada está marcada en la tabla de `TESTING_PLAN.md` sección 5.
- [ ] Ningún test quedó dependiendo de una base de datos real ni de red real (si algo
      necesitó eso, es una señal de que se filtró un test de integración a este plan —
      revisar el mock).
