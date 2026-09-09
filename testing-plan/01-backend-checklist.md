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
- **req/res/next de Express**: usar `createMockRequest`/`createMockResponse`/
  `createMockNext` de `backend/src/test/http-mocks.ts` (agregado en la Fase 1) en vez
  de armarlos a mano en cada archivo.

---

<a id="fase-1"></a>

## Fase 1 — Fundamentos (utils, middlewares, config)

Base de todo lo demás: son los archivos que casi todas las rutas atraviesan. Sin
sorpresas de dominio, pero de alto impacto si se rompen (un bug acá afecta TODAS las
rutas, no un módulo).

- [x] `backend/src/utils/errors.ts` — cada clase (`AppError`, `BadRequestError`,
      `ForbiddenError`, `NotFoundError`, `ServiceUnavailableError`, `UnauthorizedError`):
      `statusCode` y `name` correctos, `message` se propaga. *(cubierto como smoke
      test de la Fase 0 — `backend/src/utils/errors.test.ts`, 11 tests.)*
- [x] `backend/src/middlewares/auth.middleware.ts` — `authenticate`: sin header → 401
      `UnauthorizedError`; header sin `"Bearer "` → 401; token con formato inválido →
      401 "Invalid token"; token firmado con otro secret → 401 "Invalid token"; token
      expirado → 401 "Token expired" (branch dedicado para `TokenExpiredError`,
      distinto del genérico); token válido → `req.user` igual a
      `mapTokenToUser(payload)`. `requireRoles(...roles)`: sin `req.user`, o sin
      ninguno de los roles pedidos → 403 `ForbiddenError`; con al menos uno → pasa.
      Los tokens se firman de verdad con `jsonwebtoken` (mismo secret que
      `vitest.config.ts`), sin mockear la librería.
- [x] `backend/src/middlewares/current-user.middleware.ts` — sin `req.user` (no corrió
      `authenticate` antes) → 401, no llega a consultar la DB; email sin perfil local
      → 401 "User not found"; usuario encontrado → `req.user.internalUserId` seteado;
      error de Prisma → se propaga tal cual a `next()`, no se swallowea. Prisma
      mockeado directo (`vi.mock("../config/prisma")`) porque este middleware no pasa
      por un repositorio.
- [x] `backend/src/middlewares/validate.middleware.ts` — body válido → pasa sin tocar
      `res`, `req.body` queda con el resultado ya validado; `stripUnknown: true`
      efectivamente borra campos no declarados; body inválido → `next(BadRequestError)`
      con el detalle (nunca deja pasar un `ValidationError` de yup crudo);
      `abortEarly: false` → junta todos los errores de validación, no solo el primero.
- [x] `backend/src/middlewares/rate-limit.middleware.ts` — SÍ tiene lógica propia real
      (los `keyGenerator` de `loginIpRateLimiter`/`loginUserRateLimiter`: fallback
      `cf-connecting-ip` → `req.ip`, y normalización de `user` a minúsculas/trim con
      fallback a un bucket genérico). Se testeó vía `supertest` montando cada limiter
      en una app mínima: cupo por usuario/IP independiente, normalización colapsa al
      mismo bucket, mensaje/status 429 al superar el límite. Ojo con
      `skipSuccessfulRequests: true` — el handler de prueba tiene que devolver un
      status ≥ 400 (se usó 401) o el contador nunca avanza.
- [x] `backend/src/middlewares/error.middleware.ts` — un `AppError` conocido (ej.
      `NotFoundError`) responde con su `statusCode` y `message`; `MulterError` → 400
      con el mensaje de multer; un `Error` genérico no reconocido responde 500 con un
      mensaje fijo, **sin filtrar el mensaje ni el stack interno** al cliente.
- [x] `backend/src/config/cors-origins.ts` — corrección sobre la nota original de este
      checklist: no expone un callback propio (esa lógica de matching es de la
      librería `cors`, no se retestea acá). Lo que sí es unitario y se testeó: el
      valor exportado `corsOrigin` — sin `CORS_ORIGIN` → `true` (abierto); con
      `CORS_ORIGIN` → array de orígenes separado por comas y trimeado. Requirió
      `vi.resetModules()` + `import()` dinámico por test porque el valor se calcula
      una sola vez al importar el módulo.

No testear `backend/src/config/env.ts` directamente (side-effect de `process.exit` es
justamente lo que la Fase 0 ya neutralizó con env vars dummy — envolverlo en un test
propio no suma nada).

**Fase 1 cerrada 2026-09-09.** 41/41 tests en verde (`npm run test --workspace=backend`),
typecheck limpio (`npx tsc --noEmit` en `backend/`). Se agregó
`backend/src/test/http-mocks.ts` (helpers `createMockRequest`/`createMockResponse`/
`createMockNext`) para no repetir el boilerplate de mockear req/res/next — reusar en
las fases siguientes en vez de reinventarlo por archivo.

---

<a id="fase-2"></a>

## Fase 2 — Auth (seguridad crítica — prioridad alta)

Ver invariante obligatoria en `TESTING_PLAN.md` sección 4 sobre el mensaje 403 genérico
de EXTERNAL_AUTH: no te la saltees.

- [x] `backend/src/modules/auth/jwt.ts` — `verifyToken` round-trip con tokens firmados
      vía `jsonwebtoken` (secret de test); `mapTokenToUser` mapea el payload a `MappedUser`
      extrayendo roles y permissions planos; `buildFullName` con combinaciones de
      nombre/apellidos presentes y ausentes. (11 tests en `jwt.test.ts`).
- [x] `backend/src/modules/auth/auth.service.ts#login` — mockeando `fetch` global:
      credenciales correctas → devuelve token; EXTERNAL_AUTH responde 403 → mensaje genérico
      (**no** distingue "user no existe" de "password incorrecta" en el mensaje);
      `fetch` tira (red caída) o timeout → `ServiceUnavailableError`; EXTERNAL_AUTH responde
      con body no-JSON (HTML/texto plano) → no explota y resuelve según el status HTTP.
      Además cubiertos `upsertUsuario`, `getOwnProfilePictureUrl`, `setProfilePicture`,
      `removeProfilePicture`, `updateOwnName`, `updateNotificationSoundEnabled` y
      `getAppUsers` con arrays directos o envueltos y descarte de entradas mal formadas.
      (18 tests en `auth.service.test.ts`).
- [x] `backend/src/modules/auth/auth.repository.ts` — sí tiene lógica condicional real:
      `upsertUserFromExternalUser` crea usuario nuevo si no existe, o actualiza `username` y
      solo toca `name` si `syncProfileWithIntegration === true` (conservando el nombre
      local si es false); `setLocalAvatar`/`setLocalName` desactivan la sincronización;
      `findAvatarPath` resuelve o devuelve null. (9 tests en `auth.repository.test.ts`).
- [x] `backend/src/modules/auth/auth.controller.ts` — mapeo del service a HTTP usando
      `createMockRequest`, `createMockResponse` y `createMockNext` de `http-mocks.ts`:
      login exitoso vs. campos faltantes (400) vs. error de autenticación propagado;
      redirección en `getProfilePicture`; multipart validation en `updateProfilePicture`;
      status 204 en `deleteProfilePicture`; actualización de perfil y preferencias.
      (10 tests en `auth.controller.test.ts`).
- [x] `backend/src/modules/auth/auth.validator.ts` — schemas de perfil y preferencias
      (`updateProfileSchema`, `updatePreferencesSchema`): trim, validación de longitudes,
      requeridos y tipos correctos. (7 tests en `auth.validator.test.ts`).

**Fase 2 cerrada 2026-09-09.** 55 tests nuevos agregados (96/96 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Se enriqueció `http-mocks.ts` con `res.send`, `res.redirect` y `res.end` para controladores.

---

<a id="fase-3"></a>

## Fase 3 — Conversations (núcleo del dominio — prioridad alta)

`conversation.service.ts` es el nodo más conectado del grafo de este proyecto
(`assertMembership` sola tiene 12 conexiones) — es la superficie con más blast radius
si se rompe. Dedicarle el tiempo que haga falta, no apurar esta fase.

- [x] `assertMembership()` — miembro de una conversación activa → devuelve la
      conversación; no-miembro → `ForbiddenError`; conversación no existe o está
      borrada → `NotFoundError`. **Invariante obligatoria**, ver sección 4 de
      `TESTING_PLAN.md`.
- [x] `computeReceipts()` — mensaje sin lectores → todos `"sent"`; `lastReadAt` >=
      `createdAt` del mensaje → `"read"`; solo `lastDeliveredAt` >= `createdAt` →
      `"delivered"`; el propio autor del mensaje se excluye del resultado.
- [x] `aggregateReceiptStatus()` — vacío → `"sent"`; todos `"read"` → `"read"`; todos
      `"read"` o `"delivered"` (mezcla) → `"delivered"`; al menos uno en `"sent"` →
      `"sent"`. **Invariante obligatoria**.
- [x] `buildLastMessagePreview()` — mensaje borrado (con `deletedAt`) → siempre
      `"Mensaje eliminado"` **aunque `content` tenga texto real**; sin `deletedAt`,
      con texto → texto con whitespace colapsado a un solo espacio; sin texto pero con
      archivos → `"📎 Archivo adjunto"`; sin texto y sin archivos → string vacío.
      **Invariante obligatoria**.
- [x] Lógica de permisos de grupo (`assertGroupPermission`): owner/admin de grupo/miembro raso,
      y el caso **`allowGroupDelete` apagado rechaza incluso a un admin de la app**.
      **Invariante obligatoria** cubierta en `deleteConversation`.
- [x] `conversation.repository.ts` — funciones con lógica condicional real: `countExistingUsers`,
      `findLastMessagesByIds`, `clearHiddenForMembers` (bypass con arrays vacíos),
      `markDelivered` (evaluación de conteo atómico), `countUnread` (where dinámico por fecha),
      e `isConversationMember`. (12 tests en `conversation.repository.test.ts`).
- [x] `conversation.controller.ts` — mapeo exhaustivo del service a HTTP usando `http-mocks.ts`
      para creación (201), lectura, actualización, remoción, administración, settings, pines,
      favoritos y leídos. (11 tests en `conversation.controller.test.ts`).
- [x] `conversation.validator.ts` — `createConversationSchema`, `updateConversationSchema`,
      `addMembersSchema`, `setFavoriteSchema`, `setPinnedSchema`, `setMemberAdminSchema`,
      `markReadSchema`, `updateGroupSettingsSchema`: casos válidos e inválidos para cada
      schema. (18 tests en `conversation.validator.test.ts`).
- [x] `conversation.socket.ts` — `registerConversationSocket`, handlers de `JOIN` (con
      validación de autenticación y membresía) y `LEAVE`, testeados con mocks de socket y rooms.
      (5 tests en `conversation.socket.test.ts`).

**Fase 3 cerrada 2026-09-09.** 82 tests nuevos agregados (178/178 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Todas las invariantes del núcleo del dominio fueron verificadas rigurosamente.

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
