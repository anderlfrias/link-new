# Auth

Autenticación de la instalación, con cuentas locales o con un proveedor externo ([LOCAL_AUTH_PLAN.md](../../../../docs/design/LOCAL_AUTH_PLAN.md) y `docs/auth-providers.md`):

- **`external-auth`**: este módulo no administra usuarios ni contraseñas. Reenvía credenciales al microservicio **EXTERNAL_AUTH**, verifica el JWT que este emite **solo en ese momento**, sincroniza el perfil local (`User`) y sus roles con lo que EXTERNAL_AUTH devuelve, y emite la sesión de LINK (ver abajo). La mayor parte de este README describe este modo.
- **`local`**: las cuentas y sus contraseñas viven en esta base (`LocalCredential`, separada de `User`). Ver [Modo local](#modo-local).

**La sesión es siempre la de LINK:** en los dos modos el token que usa el cliente en cada request lo firma LINK (`signSessionToken`, HS256 con `SESSION_JWT_SECRET`, `iss`/`aud` `link`). El JWT de EXTERNAL_AUTH nunca llega al cliente y no autentica ninguna request, ni el socket, ni las descargas.

## Proveedores de autenticación

El login contra un sistema externo es un **proveedor**: un objeto que implementa `AuthProvider` (`src/auth-providers/api.ts`, un archivo autocontenido y versionado con `AUTH_PROVIDER_API_VERSION`). Interviene solo al iniciar sesión: valida las credenciales (`authenticate`) y, en segundo plano, puede sincronizar avatar y directorio (`onLogin`). Todo lo demás es del core y es igual para cualquier proveedor:

| Qué hace el proveedor | Qué hace LINK (`external-login.service.ts`) |
|---|---|
| Valida usuario y contraseña, y devuelve la identidad: `externalId`, correo, username, nombre y roles. Falla con `AuthProviderError` (`invalid_credentials`, `access_denied`, `provider_unavailable`, `provider_error`) | Corta a los 10 s (`provider_unavailable`), trata cualquier otro error como `provider_error`, valida que la identidad esté completa y traduce el motivo a un status HTTP y a un texto propio (nunca el del proveedor) |
| | Guarda la cuenta (`upsertExternalUser`, ver abajo), con solo los roles que conoce (`filterKnownRoles`, hoy `admin`) |
| | Rechaza una cuenta desactivada (`403 account_disabled`) aunque el proveedor acepte la contraseña |
| | Emite la sesión de LINK y audita (`LOGIN` / `LOGIN_FAILED` con `provider` = el `id` del proveedor) |
| `onLogin`: foto propia y directorio, con credenciales que solo existen en ese momento | Lo llama sin esperarlo; un error se loguea y no afecta al login |

Lo único del core que ve un proveedor es `ProviderContext` (`src/auth-providers/context.ts`): un logger, `users.upsertExternalUser`, `users.setAvatarFromProvider` y `users.listWithoutAvatar`.

**Qué proveedor hay** lo guarda `src/auth-providers/registry.ts` (`getAuthProvider()`, `isExternalProvider()`, `currentProviderId()`, `requireLocalAuth()`) y lo fija `initAuthProvider()` (`init.ts`) en `server.ts`, antes de escuchar: si la configuración del proveedor es inválida, el backend no arranca. Sin proveedor configurado, cuentas locales. Hoy el único proveedor es el de EXTERNAL_AUTH (`src/auth-providers/external-auth/`), interno y elegido por las variables `EXTERNAL_AUTH_*`.

**Reconocer a la persona** (`upsertExternalUser`, `auth.repository.ts`): primero por `externalId`, si no por correo exacto y si no por correo sin distinguir mayúsculas. Al reconocerla por correo se completan `identityProvider` y `externalId` si estaban vacíos: así una cuenta creada en modo local conserva su `User.id` al pasar a un proveedor externo.

En los dos modos hay un solo verificador de tokens (`verifyAccessToken`, `jwt.ts`) y una sola resolución contra la base (`resolveInternalUser`, `identity.ts`), que usan los middlewares HTTP, el socket y `/files/:id/content`: busca la cuenta por id, rechaza las desactivadas, las revocadas (`tokensValidAfter`) y las que superan la duración de sesión vigente, y toma nombre, username y **roles** de la fila (`User.roles`). Una cuenta con `status: INACTIVE` no entra en ningún modo, aunque EXTERNAL_AUTH acepte su contraseña.

## Variables de entorno

`src/config/env.ts` valida `DATABASE_URL`, `SESSION_JWT_SECRET` y el resto de la configuración de LINK. Las variables de un proveedor externo (hoy las `EXTERNAL_AUTH_*`) no las conoce `env.ts`: las lee y valida el propio proveedor en `init()`. Con las tres `EXTERNAL_AUTH_*` definidas el login lo valida EXTERNAL_AUTH (todo lo que describe este README); sin ninguna, cuentas locales; con una o dos, el servidor no arranca.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (siempre requerida) |
| `SESSION_JWT_SECRET` | Obligatoria en los dos modos: secreto para firmar las sesiones de LINK (HS256), de 32 caracteres o más. `LOCAL_AUTH_JWT_SECRET`, su nombre anterior, se sigue aceptando con un aviso al arrancar |
| `EXTERNAL_AUTH_API_URL` | Modo external-auth: URL base de EXTERNAL_AUTH, **sin** el sufijo `/v1/login` (ej. `https://external-auth.midominio.com`) |
| `APP_CODE_EXTERNAL_AUTH` | Modo external-auth: código de esta aplicación registrado en EXTERNAL_AUTH |
| `EXTERNAL_AUTH_JWT_SECRET` | Modo external-auth: secreto compartido para verificar (HS256) los JWT que emite EXTERNAL_AUTH |
| `PORT` | Opcional, puerto del servidor (default `4000`) |

El código del core no lee las `EXTERNAL_AUTH_*`: solo `src/auth-providers/external-auth/` las lee, una vez, en `init()`, y las guarda en su propia configuración. Lo que sí pregunta el core es si hay un proveedor externo (`isExternalProvider()`); las rutas y los servicios que solo tienen sentido con cuentas locales usan `requireLocalAuth()` (`503` `local_auth_not_enabled` con un proveedor externo) o el middleware `localAuthOnly()` (`404`).

## Modo local

Todo lo de esta sección aplica solo sin `EXTERNAL_AUTH_*` en el `.env`. Código: `local-auth.service.ts`, `password.ts`, `jwt.ts` (`signSessionToken`) e `identity.ts`.

**Login** (`POST /api/v1/auth/login`, el mismo endpoint y el mismo body `{ user, password }` que en modo external-auth):

- `user` es un correo si tiene "@", o un nombre de usuario si no. Se busca sin distinguir mayúsculas. Si dos cuentas difieren solo en mayúsculas (dato heredado), el login se rechaza y queda un `warn` con sus UUIDs.
- Las contraseñas se guardan con scrypt (`N=2^14, r=8, p=5`, siempre async), normalizadas a NFKC y con un máximo de 128 caracteres. Si un hash usa parámetros viejos, se rehashea en el próximo login exitoso.
- **Anti-enumeración:** cuenta inexistente, contraseña incorrecta y cuenta sin contraseña responden lo mismo (`401` "Usuario, correo o contraseña incorrectos.") y cuestan lo mismo: sin cuenta, se verifica igual contra un hash ficticio. Una cuenta desactivada responde `403` `account_disabled` solo si la contraseña era correcta. La auditoría (`LOGIN_FAILED`) sí distingue los motivos: `unknown_account`, `wrong_password`, `no_credential`, `account_disabled`.
- El token es un JWT HS256 firmado con `SESSION_JWT_SECRET`: `sub` (id interno), `email`, `iss: "link"`, `aud: "link"`, `iat` y `exp` según la duración de sesión vigente. En modo local `user.id` y `user.internalUserId` son el mismo UUID, y los roles salen de `User.roles`.
- **Cambio obligatorio:** si un admin restableció la contraseña, si venció, o si no cumple la política vigente, el token sale restringido (`pcr: true`) y la respuesta trae `mustChangePassword: true` con el motivo (`reset`, `expired` o `policy`, en ese orden de prioridad). Ese token solo sirve para `PATCH /auth/password`: el resto de la API responde `403` `password_change_required`, y el socket lo rechaza.

- **Bloqueo por intentos fallidos** (apagado por defecto): con `maxFailedLoginAttempts` configurado, esa cantidad de contraseñas incorrectas seguidas bloquea la cuenta durante `lockoutDurationMinutes`, aunque después llegue la correcta. El contador se incrementa de forma atómica en `LocalCredential` y solo corre con el bloqueo activado; un login exitoso lo reinicia. Una cuenta bloqueada responde `429` con el mismo mensaje que el rate limit, y se audita `LOGIN_FAILED` con motivo `account_locked`.

**Sesión:** no hay refresh. `resolveInternalUser` rechaza un token si la cuenta está desactivada, si es anterior a `User.tokensValidAfter` (se mueve al cambiar o restablecer la contraseña, truncado al segundo) o si es más viejo que la duración de sesión vigente: bajar la duración en la configuración corta las sesiones ya abiertas.

**`GET /api/v1/auth/config`** (público): `provider` (`id`, `displayName`, `external`) y `capabilities` (`passwordChange`, `accountManagement`: `full` o `status-only`), y con cuentas locales además `passwordPolicy` (largo mínimo y máximo, y reglas de composición), lo que el frontend necesita para mostrar las reglas antes de que alguien elija una contraseña. El frontend decide qué mostrar por `capabilities`, nunca por el nombre del proveedor. Nunca la duración de sesión.

**`PATCH /api/v1/auth/password`** (solo modo local; `404` en external-auth): `{ currentPassword, newPassword }` → `{ token, exp }`. Acepta el token restringido. Rechaza con `400` y `code` (nunca `401`, que el frontend interpreta como sesión vencida): `invalid_current_password`, `password_policy` (con `rules`, la lista de reglas que no cumple) o `password_reused` (la nueva es igual a la actual o, con historial, a una de las últimas N). La contraseña saliente pasa a `previousPasswordHashes`, podado a N-1. Revoca todos los tokens anteriores, corta los sockets abiertos y audita `CHANGE_PASSWORD` con el motivo (`voluntary`, `reset` o `policy`). Rate limit propio: 5 intentos fallidos cada 15 minutos por cuenta.

**Cuentas:** las crea un admin desde el panel (`POST /api/v1/admin/users`, ver [`users`](../users/README.md)), o con el CLI para el primer admin y las emergencias: `npm run auth:admin -- create-admin --email <correo>` y `npm run auth:admin -- reset-password --email <correo>`. La contraseña temporal sale una sola vez por la terminal (nunca por el logger) y deja el cambio obligatorio.

**Política de contraseñas:** la configura un admin en *Configuración global* (`settings`), no el `.env`: duración de sesión (1 a 720 horas, default 12), largo mínimo (8 a 128, default 12), cuatro reglas de composición, vencimiento (1 a 365 días), historial (0 a 12, contando la actual) y bloqueo (3 a 50 intentos, de 1 a 1440 minutos). Todo apagado por defecto salvo el largo mínimo. El piso de 8 caracteres no se puede bajar. Endurecer la política no corta sesiones: se aplica en el próximo login de cada cuenta.

## Levantar el servidor

```bash
cd backend
npm install
npm run dev
```

Por defecto queda escuchando en `http://localhost:4000`.

## Endpoint

```
POST /api/v1/auth/login
```

Se arma así: `app.ts` monta todo bajo `/api` → `route.ts` monta el módulo bajo `/v1/auth` → `auth.route.ts` define `/login`. **La ruta sin `/login` (`/api/v1/auth`) no existe** — postear ahí devuelve `Cannot POST /api/v1/auth`.

### Request

Requiere `Content-Type: application/json` **o** `application/x-www-form-urlencoded` (ambos están soportados). Sin un `Content-Type` reconocido, Express no parsea el body y `user`/`password` llegan `undefined`.

```json
{
  "user": "jdoe",
  "password": "secreto"
}
```

### Ejemplo (curl)

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"jdoe","password":"secreto"}'
```

### Ejemplo (PowerShell)

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login `
  -ContentType "application/json" `
  -Body (@{ user = "jdoe"; password = "secreto" } | ConvertTo-Json)
```

### Respuesta 200

```json
{
  "token": "<sesión de LINK: JWT propio firmado con SESSION_JWT_SECRET, no el de EXTERNAL_AUTH>",
  "user": {
    "id": "<uuid local en la tabla User, igual a internalUserId>",
    "email": "jdoe@empresa.com",
    "username": "jdoe",
    "fullName": "Juan Doe Pérez",
    "roles": ["admin"],
    "exp": 1735000000,   // vencimiento de la sesión de LINK, no el del JWT de EXTERNAL_AUTH
    "internalUserId": "<uuid local en la tabla User>",
    "authProvider": "external-auth"
  }
}
```

`internalUserId` es el `id` interno del perfil recién creado/actualizado en la base local (ver "Reconocer a la persona"); es lo que hay que usar para relacionar conversaciones/mensajes. `user.id` es el mismo valor: el id de la persona en EXTERNAL_AUTH no sale del backend. Es también el `sub` de la sesión de LINK.

**Roles:** en cada login se guardan en `User.roles` los roles que entrega EXTERNAL_AUTH y que la app conoce (`filterKnownRoles`, hoy solo `admin`); los demás se descartan. De ahí en más se leen de la base en cada request, como en el modo local, así que cambiar los roles en EXTERNAL_AUTH se refleja en el próximo login, no antes. `user.roles` en la respuesta son los guardados.

**`user.fullName` sale de la base local (`internalUser.name`), no del JWT tal cual.** Si este usuario ya cambió su nombre acá (ver "Endpoint: cambiar mi nombre" abajo), `User.syncProfileWithIntegration` es `false` y `upsertUsuario()` no lo pisa con lo que diga EXTERNAL_AUTH — pero el JWT de EXTERNAL_AUTH sigue teniendo el nombre viejo. El controller arma la respuesta con `{ ...mappedUser, fullName: internalUser.name, ... }` para que el propio cliente vea siempre el nombre real (el de esta base), nunca el de EXTERNAL_AUTH cuando difieren.

### Errores posibles

| Status | Causa |
|---|---|
| `400` | Falta `user` o `password` en el body |
| `401` | EXTERNAL_AUTH respondió que las credenciales son inválidas |
| `403` | EXTERNAL_AUTH respondió `403` (o un error con "forbidden"). **Ojo:** EXTERNAL_AUTH usa este mismo status tanto para credenciales incorrectas como para falta de acceso a esta `app` — no hay forma de distinguir el motivo real desde acá, así que el mensaje que ve el usuario es genérico a propósito ("revisá tus credenciales... si persiste, contactá a un administrador"), nunca "no tenés acceso" |
| `429` | Se agotó el cupo de intentos de login (solo cuentan los fallidos) — por usuario e IP (5 cada 15 min, `loginUserIpRateLimiter`), por usuario desde cualquier IP (20 cada 15 min, `loginUserRateLimiter`) o por IP (20 cada 15 min, `loginIpRateLimiter`), ver `rate-limit.middleware.ts` |
| `503` | EXTERNAL_AUTH no respondió (caído, timeout de 5s) o devolvió un status inesperado (5xx u otro distinto de `200`/`401`/`403`) |

### Auditoría de autenticación

Cada intento de autenticación se registra en el audit trail normativo (`AuditLog`):
- **Login exitoso (`LOGIN`)**: Se registra con `userId` (el ID interno del usuario en la base local), `actorEmail` (el email resuelto), `ip`, `userAgent` y `requestId`. No contiene metadata sensible.
- **Login fallido (`LOGIN_FAILED`)**: Se registra con `userId: null`, `actorEmail` (el usuario o email enviado en el intento), `ip`, `userAgent`, `requestId` y la razón técnica en metadata (`{ reason: "forbidden_by_provider" | "invalid_credentials" | "provider_error" | "provider_unreachable" }`).
- **Ambigüedad de EXTERNAL_AUTH**: `forbidden_by_provider` refleja que el proveedor retornó 403 / "forbidden". Como EXTERNAL_AUTH no distingue entre "contraseña incorrecta" y "usuario sin permisos para esta app", este valor **no** debe interpretarse de forma taxativa como contraseña errónea.
- **Privacidad estricta**: Las contraseñas, tokens y respuestas completas de EXTERNAL_AUTH **nunca** se almacenan en la tabla de auditoría ni en los logs de aplicación.

### Reenvío de IP a EXTERNAL_AUTH

Para evitar que EXTERNAL_AUTH aplique rate limiting o bloquee la IP del servidor de chat (lo que generaría un bloqueo general para todos los usuarios ante fallos reiterados), la petición a `/v1/login` de EXTERNAL_AUTH reenvía la IP del cliente real en los encabezados HTTP `X-Forwarded-For` y `X-Real-IP` (tomada de `CF-Connecting-IP` o `req.ip`). Así, las sanciones o límites de EXTERNAL_AUTH se aplican de forma individual por IP de origen.

## Desacoplar el perfil del proveedor externo (`syncProfileWithIntegration`)

`User.syncProfileWithIntegration` (`schema.prisma`, default `true`) decide si el login (y la sincronización de contactos que hace el proveedor en `onLogin`, ver más abajo) sigue actualizando `name`/avatar desde el proveedor de identidad externo configurado — hoy EXTERNAL_AUTH, pero el mecanismo no asume cuál; podría ser cualquier otro mañana sin tocar este flag. Pasa a `false` automáticamente la primera vez que el usuario cambia su nombre o su foto **acá** (`auth.service.ts`: `updateOwnName`/`setProfilePicture`/`removeProfilePicture`, todas vía `setLocalName`/`setLocalAvatar` en `auth.repository.ts`) — desde ese momento esos dos campos viven únicamente en esta base: ni el login ni la sincronización de contactos vuelven a pisarlos con lo que diga el proveedor externo, sin importar cuántas veces ese usuario inicie sesión.

`upsertExternalUser()` (`auth.repository.ts`) es quien aplica esto: no es un `upsert` directo porque la condición ("¿sigo sincronizando?") depende de la fila ya existente — primero busca a la persona (ver "Reconocer a la persona"), y solo incluye `name` en el `update` si `syncProfileWithIntegration` seguía en `true`. `username` no es un campo de "perfil" (no lo edita el usuario) y siempre se actualiza, sync esté prendido o no. El avatar lo guarda `setAvatarFromProvider()` (`auth.service.ts`), que respeta el mismo flag y no reescribe el archivo si el checksum no cambió.

## Endpoint: foto de perfil

```
GET /api/v1/auth/profile/picture
```

Requiere `Authorization: Bearer <token>` + `attachInternalUser`. Ya **no** proxea a ningún proveedor externo: lee `avatarFileId` de la base local (`AuthService.getOwnProfilePictureUrl()`) y responde `302` a `/api/v1/files/<avatarFileId>/content` (mismo endpoint seguro de contenido que sirve el avatar de cualquier otro usuario). `404` si todavía no tiene ninguna foto cacheada.

```bash
curl -L http://localhost:4000/api/v1/auth/profile/picture \
  -H "Authorization: Bearer <token>" \
  --output foto.jpg
```

Al ser un redirect a una URL propia por archivo (`/api/v1/files/<avatarFileId>/content`), ya no hace falta el `Vary: Authorization` que este endpoint necesitaba cuando servía bytes directamente desde una URL literal única para todos — un problema de este diseño más simple, no algo que haya que replicar.

Esta foto llega a la base de dos formas, y ambas conviven: (1) sincronizada desde el proveedor externo en cada login (la propia) o al sincronizar el directorio, que también ocurre en el login (la de los contactos), mientras `syncProfileWithIntegration` siga en `true` (ver sección arriba); o (2) subida acá mismo vía `PUT` (abajo), que apaga ese sync. Para la foto de **otros** usuarios (no la propia), ver "Endpoint: foto de perfil de un tercero" más abajo — ese sigue siendo el único camino que todavía pega contra el proveedor externo en este módulo.

## Endpoint: foto de perfil de un tercero (uso interno, sin proxy propio)

```
GET /v1/profile/picture/:username
```

A diferencia del anterior, EXTERNAL_AUTH identifica al usuario por `username` en la URL, no por el token — puede traer la foto de **cualquier** usuario de la app, no solo la de quien está autenticado. No hay una ruta HTTP propia que lo exponga (no hace falta: nada en el frontend necesita pedir la foto de un tercero en tiempo real) — solo lo usa `getProfilePictureByUsername()` en `auth-providers/external-auth/client.ts`, server-to-server, desde `onLogin`, para cachear localmente el avatar de contactos que la sincronización del directorio trae de `GET /v1/apps/users/by-codes` (ver "Endpoint: contactos de la app" abajo) y que todavía no iniciaron sesión acá. Mismo formato de respuesta y mismo mapeo de errores que el `GET` de arriba (data URI, `USER_NOT_FOUND`/`PROFILE_PICTURE_NOT_FOUND` → 404 local).

## Endpoint: contactos de la app

```
GET /v1/apps/users/by-codes?codes=<APP_CODE_EXTERNAL_AUTH>
```

Devuelve todos los usuarios de EXTERNAL_AUTH con acceso a esta app (identificada por `APP_CODE_EXTERNAL_AUTH`), hayan iniciado sesión acá alguna vez o no — a diferencia del directorio local (`GET /api/v1/users`), que hasta ahora solo listaba a quien ya se había logueado. `getAppUsers()` (`auth-providers/external-auth/client.ts`) lo llama, y el `onLogin` del proveedor lo sincroniza al iniciar sesión, con el token de esa persona y con throttle (a lo sumo una vez cada 10 minutos en todo el proceso, `DIRECTORY_SYNC_INTERVAL_MS`; `GET /api/v1/users` no llama a EXTERNAL_AUTH): guarda cada uno como `User` local con `ctx.users.upsertExternalUser` — necesario porque `createConversation` exige que el otro miembro ya exista localmente — y baja la foto de los que todavía no tienen una **y** cuyo `syncProfileWithIntegration` sigue en `true` (`ctx.users.listWithoutAvatar`; si esa persona ya editó su nombre/foto acá, aunque sea desde otra sesión, no se le pisa el nombre y ni se intenta traerle una foto nueva). Si EXTERNAL_AUTH no responde, la sincronización no lanza ni consume la ventana: el directorio se sirve con lo que ya había en la base local y el próximo login lo reintenta.

No se cachea del lado del backend (cada request vuelve a pedirle a EXTERNAL_AUTH), pero sí manda `Cache-Control: private, max-age=300` para que el navegador no repita el request en cada render de `<Avatar>`.

| Status | Causa |
|---|---|
| `404` | EXTERNAL_AUTH respondió `USER_NOT_FOUND` o `PROFILE_PICTURE_NOT_FOUND` (usuario no existe o no tiene foto cargada) |
| `503` | EXTERNAL_AUTH no respondió (caído, timeout de 5s), devolvió un `code` inesperado, o el body no era un data URI parseable |

## Endpoint: cambiar/quitar mi foto de perfil

```
PUT    /api/v1/auth/profile/picture
DELETE /api/v1/auth/profile/picture
```

Requieren `attachInternalUser` además de `authenticate` (`auth.route.ts`): cachean/limpian la foto como `StoredFile` propio, lo que necesita el `internalUserId`, no solo el token. **Ninguna de las dos toca el proveedor externo** — son 100% locales, a propósito (ver "Desacoplar el perfil del proveedor externo" arriba). Ambas apagan `syncProfileWithIntegration` para este usuario.

**`PUT`** recibe `multipart/form-data` con un campo `file` (imagen, límite propio de 5 MB — más chico que `MAX_UPLOAD_SIZE_MB` de adjuntos, definido en `auth.route.ts`; ese límite quedó de cuando EXTERNAL_AUTH guardaba esto como texto en su base, y sigue siendo razonable para un avatar). El controller (`updateProfilePicture`) llama a `AuthService.setProfilePicture(userId, buffer, mimeType)`, que guarda el buffer como `StoredFile` (`FileService.storeAvatar`) y apunta `User.avatarFileId` ahí vía `setLocalAvatar()` (`auth.repository.ts`) — la misma función que apaga el flag. Devuelve el `StoredFileResponse` resultante (`200`).

**`DELETE`** no manda body. Llama a `AuthService.removeProfilePicture(userId)`: limpia `avatarFileId` a `null` localmente (`setLocalAvatar(userId, null)`, mismo apagado de flag — sacarse la foto es una elección tan explícita como subir una nueva). Responde `204`.

No importa si la imagen del `PUT` viene de un archivo real elegido por el usuario o de un avatar de [Boring Avatars](https://boringavatars.com) rasterizado a PNG en el frontend (ver `frontend/src/features/profile`) — el endpoint no distingue entre ambos, siempre es "un archivo de imagen".

| Status | Causa |
|---|---|
| `400` | Falta el archivo (`PUT`), o el tipo de imagen no está permitido |

## Endpoint: cambiar mi nombre

```
PATCH /api/v1/auth/profile
```

```json
{ "name": "Nuevo Nombre" }
```

`name`: 1-120 caracteres, requerido (`auth.validator.ts`). Requiere `attachInternalUser` + `authenticate`. Llama a `AuthService.updateOwnName(userId, name)` → `setLocalName()` (`auth.repository.ts`): guarda el nombre y apaga `syncProfileWithIntegration`, igual que la foto — 100% local, nunca toca el proveedor externo. Responde `200` `{ "name": "Nuevo Nombre" }`.

## Usar el token en rutas protegidas

Cualquier ruta de otro módulo que necesite autenticación usa el middleware transversal `authenticate` (`src/middlewares/auth.middleware.ts`):

```ts
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";

router.get("/", authenticate, Controller.list);
router.delete("/:id", authenticate, requireRoles("admin"), Controller.remove);
```

El cliente manda el mismo token que devolvió `/login`:

```
Authorization: Bearer <token>
```

`authenticate` lo verifica contra `SESSION_JWT_SECRET` (HS256 fijado, `iss` y `aud` `link`) en cada request, sin consultar a EXTERNAL_AUTH, y llena `req.user` con la identidad del token (`attachInternalUser` la completa desde la base, con `internalUserId`). Si el token expiró devuelve `401` con "Token expired"; si es inválido —incluido un JWT de EXTERNAL_AUTH—, "Invalid token".
