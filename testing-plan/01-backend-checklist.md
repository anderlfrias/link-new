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

- [x] `sendMessage()` — creación + entrega vía socket (mockeando `getIO`); mensaje con
      reply (`replyTo`) referencia el original o falla con 400 si no existe en la conversación;
      mensaje tipo `STICKER` (con `type: MessageType.STICKER` y un `fileId`); push notification
      a miembros desconectados vía `PushService.notifyUsers`.
- [x] `forwardMessage()` — reenvía como copia independiente a otra conversación donde el usuario
      es miembro; si no es miembro de la de origen → `ForbiddenError` (vía `assertMembership`).
- [x] `listMessages()` — paginación por cursor `beforeId` y límite acotado (1 a 100),
      marca entregado al solicitante y computa recibos de entrega.
- [x] `listConversationFiles()` — filtra y mapea archivos adjuntos en la conversación.
- [x] `editMessage()` — autor edita dentro de la ventana de tiempo → OK; no-autor →
      `ForbiddenError`; tipo no-TEXT → `BadRequestError`; fuera de la ventana de tiempo
      (`messageEditTimeLimitMinutes`) o si `allowMessageEdit` está apagado → `ForbiddenError`.
      **Invariante obligatoria**.
- [x] `deleteMessage()` — autor dentro del tiempo configurado realiza soft delete (marca
      `deletedAt` y `deletedById` preservando el contenido físico en la DB); fuera de ventana
      o flag global apagado → `ForbiddenError`; creador de la conversación puede borrar
      mensajes ajenos por moderación sin límite de tiempo; emite `MESSAGE_EVENTS.DELETED`.
      **Invariante obligatoria**.
- [x] `message.repository.ts` — lógica condicional: `countExistingFiles` con array vacío,
      `createMessage` transaccional actualizando `Conversation.lastMessageId`, paginación por
      cursor en `listMessages` y `listFiles`, `existsInConversation`, `softDelete` y
      `softDeleteOlderThan` (11 tests en `message.repository.test.ts`).
- [x] `message.controller.ts` — mapeo service → HTTP (`create` 201, `forward` 201, `list`,
      `listFiles`, `update`, `remove`). (7 tests en `message.controller.test.ts`).
- [x] `message.validator.ts` — schemas de crear (texto, adjuntos, STICKER, límites), editar y
      reenviar. (12 tests en `message.validator.test.ts`).
- [x] `message.socket.ts` — handlers de `TYPING_START`, `TYPING_STOP` y `DISCONNECTING`
      verificando membresía y excluyendo al propio remitente. (6 tests en `message.socket.test.ts`).

**Fase 4 cerrada 2026-09-09.** 55 tests nuevos agregados (233/233 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Invariantes de ventana de tiempo y soft delete cubiertas rigurosamente.

---

<a id="fase-5"></a>

## Fase 5 — Files & Storage

- [x] `file.service.ts` — validación de mime type contra
      `backend/src/constants/allowed-file-types.constant.ts`; archivo que excede
      `ABSOLUTE_MAX_UPLOAD_BYTES` o el límite configurable
      (`AppSettings.maxUploadSizeMb`) → rechazado. Nota de sync: si tocás esta
      validación, la Fase 14 (frontend) tiene el espejo cliente — dejar comentado en
      el test que ambos lados deben coincidir (ver invariante en `TESTING_PLAN.md`
      sección 4). (19 tests en `file.service.test.ts`).
- [x] `file.repository.ts#aggregateFilesForAdmin` — vía la función pública (el helper
      `buildAdminFileWhere` es privado, no se importa directo): filtro por categoría,
      por rango de fechas, sin filtros (trae todo). (8 tests en `file.repository.test.ts`).
- [x] `file.controller.ts` — mapeo service → HTTP, incluyendo el flujo de upload
      (`multer` ya parseó `req.file`, no hace falta testear multer en sí). (7 tests en `file.controller.test.ts`).
- [x] `backend/src/storage/local-disk.storage.ts` — **este sí conviene testear con I/O
      real** (no es una dependencia externa, es filesystem local determinístico): usar
      un directorio temporal (`fs.mkdtempSync(path.join(os.tmpdir(), ...))`) en vez de
      `UPLOADS_ROOT` real; guardar un archivo y verificar que existe con el contenido
      correcto; borrar y verificar que desaparece. Limpiar el directorio temporal en
      `afterEach`. (4 tests en `local-disk.storage.test.ts`).
- [x] `backend/src/storage/index.ts` — wiring puro exportando singleton `storage = new LocalDiskStorage()`.

**Fase 5 cerrada 2026-09-09.** 38 tests nuevos agregados (271/271 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Validación de tipos MIME, límites de tamaño, notas de voz, avatares, almacenamiento local determinístico y agregación admin cubiertos rigurosamente.

---

<a id="fase-6"></a>

## Fase 6 — Settings & permisos de grupo

- [x] `settings.service.ts#getSettings` / `getPublicSettings` — el segundo expone solo
      el subconjunto público (verificar que campos sensibles/admin-only no aparecen en
      el resultado de `getPublicSettings`). (tests en `settings.service.test.ts`).
- [x] `settings.service.ts#updateSettings` — actualiza y persiste vía repository
      (mockeado). (tests en `settings.service.test.ts`).
- [x] `settings.service.ts#resolveEffectiveGroupSettings` — merge de `AppSettings`
      globales + override de grupo: cuando el grupo no tiene override, prevalece el
      valor global; cuando sí lo tiene y el flag está en la lista de
      `getGroupOverrideAllowedFlags()`, prevalece el override; si el flag NO está en
      esa lista permitida, el override se ignora. (tests en `settings.service.test.ts`).
- [x] `settings.service.ts#getGroupOverrideAllowedFlags` — devuelve exactamente el set
      esperado de flags overrideables. (tests en `settings.service.test.ts`).
- [x] `settings.repository.ts` — `getOrCreate` singleton y `update`. (2 tests en `settings.repository.test.ts`).
- [x] `settings.controller.ts` — mapeo service → HTTP, incluyendo que la ruta pública
      (`/settings/public`) no exige rol admin y la de `/admin/settings` sí. (14 tests en `settings.controller.test.ts`).
- [x] `settings.validator.ts` — schema de `PATCH /admin/settings` (`updateSettingsSchema` con MIME types, limits, enums) y `updateGroupSettingsSchema` probado en fase 3. (11 tests en `settings.validator.test.ts`).

**Fase 6 cerrada 2026-09-09.** 36 tests nuevos agregados (307/307 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Políticas globales de gobierno, flags de override por grupo, DTO público sin datos sensibles y guardias de rol admin cubiertos rigurosamente.

---

<a id="fase-7"></a>

## Fase 7 — Users, Push, Giphy

**Users**
- [x] `user.service.ts` — sincronización con EXTERNAL_AUTH (`AuthService.syncAppUsers`), listado paginado para administración con agregación de storage usado (`sumStorageForUsers`) y grupos administrados (`countGroupAdminForUsers`). (3 tests en `user.service.test.ts`).
- [x] `user.repository.ts#findAllForAdmin` / `#countAllForAdmin` — búsqueda combinada en nombre, email y username, paginación por cursor `beforeId`/`limit`, búsqueda de directorio de contactos activa, agregación de storage y membresías admin. (10 tests en `user.repository.test.ts`).
- [x] `user.controller.ts` — mapeo service → HTTP para directorio público (`list`) y panel de administración (`listAdmin`). (6 tests en `user.controller.test.ts`).

**Push**
- [x] `push.service.ts` — mock de `web-push` (`webpush.sendNotification`, `WebPushError`); envío exitoso, retorno inmediato ante lista vacía, limpieza automática de suscripciones caducadas (404/410) en DB y tolerancia sin fallas ante errores transitorios. (7 tests en `push.service.test.ts`).
- [x] `push.repository.ts` — upsert por endpoint (clave natural de dispositivo), eliminación por endpoint y búsqueda por userIds. (3 tests en `push.repository.test.ts`).
- [x] `push.controller.ts` — `subscribe()` valida claves y guarda la suscripción (204); `unsubscribe()` elimina (204); `getPublicKey()` expone VAPID public key. (7 tests en `push.controller.test.ts`).

**Giphy**
- [x] `giphy.service.ts#importGiphyAsset` — **invariante de seguridad SSRF:** revalidación estricta de `originalUrl` exigiendo protocolo HTTPS y host perteneciente a `*.giphy.com` (o `giphy.com`), rechazando dominios externos, spoofing, urls malformadas, tipos no-imagen y archivos que excedan el límite de subida. (tests en `giphy.service.test.ts`).
- [x] `giphy.service.ts#searchGiphy` / `#getTrendingGiphy` — mock de `fetch` a la API de Giphy, mapeo de renditions (`fixed_width` / `original`), filtrado de incompletos, 503 (`ServiceUnavailableError`) si `GIPHY_API_KEY` falta o Giphy no responde, y 403 (`ForbiddenError`) si `allowStickersAndGifs` está apagado globalmente. (tests en `giphy.service.test.ts`).
- [x] `giphy.controller.ts` — validación de `kind` (`gifs` / `stickers`), validación de query requerida, paginación y mapeo a HTTP. (9 tests en `giphy.controller.test.ts`).
- [x] `giphy.validator.ts` — schema de importación de assets `importGiphyAssetSchema` con `kind`, `giphyId`, y `originalUrl` como URL válida. (5 tests en `giphy.validator.test.ts`).

**Fase 7 cerrada 2026-09-09.** 65 tests nuevos agregados (372/372 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Invariante SSRF de Giphy, limpieza de Web Push caducado y agregaciones del panel admin de usuarios cubiertos rigurosamente.

---

<a id="fase-8"></a>

## Fase 8 — Socket gateway & Presence

Esta fase testea el "plumbing" de sockets, no la lógica de negocio de cada módulo (esa
ya se cubrió en Fases 3/4 para conversations/messages).

- [x] `backend/src/socket/gateway.ts` — `createSocketGateway`/`attachSocketModules`:
      cada módulo registrado se attachea sin pisar a los demás. (2 tests en `socket/gateway.test.ts`).
- [x] `backend/src/socket/middleware.ts#applyMiddlewares` — se aplican en el orden
      correcto, un middleware que llama a `next(error)` corta la cadena. (3 tests en `socket/middleware.test.ts`).
- [x] `backend/src/socket/registry.ts#registerSocketModule` — registra módulos y los ejecuta todos
      en orden ante cada nueva conexión. (1 test en `socket/registry.test.ts`).
- [x] `backend/src/socket/rooms.ts` — `conversationRoomName()`/`userRoomName()`:
      funciones puras, formato de string exacto; join/leave delegados y `getConnectedUserIds` con deduplicación. (8 tests en `socket/rooms.test.ts`).
- [x] `backend/src/socket/socket-auth.middleware.ts` — handshake sin token, no-string, expirado, inválido o usuario no encontrado en base rechazan conexión; handshake con token válido resuelve internalUserId y puebla `socket.data.user`. (5 tests en `socket/socket-auth.middleware.test.ts`).
- [x] `backend/src/modules/presence/presence.socket.ts#registerPresenceSocket` —
      socket autenticado une al room personal `user:<internalUserId>`; socket sin usuario no realiza join. (2 tests en `presence/presence.socket.test.ts`).
- [x] `backend/src/app.ts` — smoke test con `supertest` importando el `app` exportado: `GET /` → 200 "Backend is running"; ruta `/api/v1/conversations` sin token → 401; `GET /uploads/<file>` → header `Cross-Origin-Resource-Policy: cross-origin` presente. (3 tests en `app.test.ts`).

**Fase 8 cerrada 2026-09-09.** 24 tests nuevos agregados (396/396 tests en verde en
`npm run test --workspace=backend`), typecheck limpio (`npx tsc --noEmit` en `backend/`).
Socket gateway, middlewares, autenticación de sockets, presencia y smoke tests de app cubiertos rigurosamente.

---

---

## Adenda — hallazgos de auditoría (2026-09-09)

Una auditoría posterior al cierre de las Fases 1–8 (correr toda la suite + typecheck +
revisar con subagentes las invariantes obligatorias y los archivos de cobertura baja)
encontró gaps puntuales, ya cerrados acá — fuera de la numeración de fases porque
todas ya estaban marcadas `[x]`:

- [x] `backend/src/modules/auth/auth.service.ts` — la Fase 2 había dejado sin testear
      toda la lógica de sincronización de avatar: `fetchExternalUserProfilePicture`
      (`getProfilePicture`/`getProfilePictureByUsername`, parseo de data URI, manejo
      de `USER_NOT_FOUND`/`PROFILE_PICTURE_NOT_FOUND`), `syncAvatar`
      (`syncProfilePicture`/`syncContactAvatar` — dedup por checksum para no
      reescribir sin cambios, nunca lanza) y `syncAppUsers` (upsert en lote, tolera
      que un usuario puntual falle sin romper el resto). Cobertura del archivo pasó de
      49% a 95% líneas.
- [x] `backend/src/workers/message-retention.worker.ts` — **nunca estuvo en ningún
      ítem de este checklist** (omisión del plan original al redactarlo, no de la
      ejecución de ninguna fase). Tiene lógica real: deshabilitado por default
      (`messageRetentionDays == null` → no hace nada), cálculo de fecha de corte a
      partir de días, sweep inmediato al arrancar + de nuevo en cada intervalo. Ahora
      100% de cobertura (`message-retention.worker.test.ts`, con `vi.useFakeTimers()`
      y `vi.advanceTimersByTimeAsync()` para no depender de tiempo real).
- [x] `backend/src/modules/conversations/conversation.repository.ts#listForUser` — el
      propio comentario del código marca como no-obvio el anidamiento de `hiddenAt`
      dentro del `some` de members (no "algún miembro oculto", sino "mi propia
      membresía no oculta"); ahora tiene test dedicado que verifica el `where` exacto.
      También se agregó test de `createConversation` (repo) — la regla de
      creador-auto-admin (`isAdmin: userId === createdById`) — y de `markRead` (el
      spread condicional de `lastReadMessageId`, mismo patrón que `countUnread`).
- [x] `backend/src/modules/conversations/conversation.service.ts` —
      `setConversationFavorite` nunca se llamaba en ningún test (el `describe` decía
      cubrir favorite+pinned pero solo ejercitaba pinned); se agregaron los caminos de
      éxito y ramas de permiso/límite que faltaban en `updateGroupSettings`,
      `addMembers`, `updateConversation` (incluyendo los dos `logAudit` independientes
      de `CHANGE_NAME`/`CHANGE_IMAGE`), `setMemberAdminStatus` (usuario no-miembro,
      estado ya idéntico al pedido) y las validaciones de `createConversation` (mínimo/
      máximo de miembros del grupo, `name` requerido, miembros inexistentes).
      Cobertura del archivo pasó de 72% a 91% líneas.

**442/442 tests en verde** (`npm run test --workspace=backend`), typecheck limpio.
Cobertura global del backend: 84.4% → 93.4% líneas (piso configurado: 75%).

## Definition of Done — Backend completo (Fases 1–8)

- [x] Las 8 fases de este archivo tienen todos sus checkboxes en `[x]`.
- [x] `npm run test --workspace=backend` pasa completo, sin tests skippeados sin
      justificación.
- [x] Cada fase cerrada está marcada en la tabla de `TESTING_PLAN.md` sección 5.
- [x] Ningún test quedó dependiendo de una base de datos real ni de red real (si algo
      necesitó eso, es una señal de que se filtró un test de integración a este plan —
      revisar el mock).
