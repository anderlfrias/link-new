# Auth

Autenticación de la instalación, en uno de dos modos que se deducen del `.env` ([LOCAL_AUTH_PLAN.md](../../../../docs/design/LOCAL_AUTH_PLAN.md)):

- **`external-auth`**: este módulo no administra usuarios ni contraseñas. Reenvía credenciales al microservicio **EXTERNAL_AUTH**, verifica el JWT que este emite y sincroniza el perfil local (`User`) con lo que EXTERNAL_AUTH devuelve. El backend no emite su propio token: el que usa el cliente en cada request es el de EXTERNAL_AUTH. La mayor parte de este README describe este modo.
- **`local`**: las cuentas y sus contraseñas viven en esta base (`LocalCredential`, separada de `User`) y el backend firma su propio token. Ver [Modo local](#modo-local).

En los dos modos hay un solo verificador de tokens (`verifyAccessToken`, `jwt.ts`) y una sola resolución contra la base (`resolveInternalUser`, `identity.ts`), que usan los middlewares HTTP, el socket y `/files/:id/content`. Una cuenta con `status: INACTIVE` no entra en ningún modo, aunque EXTERNAL_AUTH acepte su contraseña.

## Variables de entorno

Definidas y validadas en `src/config/env.ts`. Las de EXTERNAL_AUTH deciden el modo de autenticación de la instalación (`src/config/auth-config.ts`, ver [LOCAL_AUTH_PLAN.md](../../../../docs/design/LOCAL_AUTH_PLAN.md)): con las tres definidas, modo `external-auth` (todo lo que describe este README); sin ninguna, modo `local`; con una o dos, el servidor no arranca.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (siempre requerida) |
| `EXTERNAL_AUTH_API_URL` | Modo external-auth: URL base de EXTERNAL_AUTH, **sin** el sufijo `/v1/login` (ej. `https://external-auth.midominio.com`) |
| `APP_CODE_EXTERNAL_AUTH` | Modo external-auth: código de esta aplicación registrado en EXTERNAL_AUTH |
| `EXTERNAL_AUTH_JWT_SECRET` | Modo external-auth: secreto compartido para verificar (HS256) los JWT que emite EXTERNAL_AUTH |
| `LOCAL_AUTH_JWT_SECRET` | Modo local: secreto para firmar los tokens de las cuentas locales, de 32 caracteres o más |
| `PORT` | Opcional, puerto del servidor (default `4000`) |

El código de este módulo no lee esas variables sueltas: pide la config a `requireExternalUserConfig(env.auth)`. En modo local esa función tira `503` (`external-auth_not_configured`), así que ningún camino que pegue contra EXTERNAL_AUTH (login, fotos, contactos) llega a llamar a una URL `undefined`. Lo simétrico para el modo local es `requireLocalConfig(env.auth)` (`503` `local_auth_not_enabled` en modo external-auth).

## Modo local

Todo lo de esta sección aplica solo sin `EXTERNAL_AUTH_*` en el `.env`. Código: `local-auth.service.ts`, `password.ts`, `jwt.ts` (`signLocalToken`) e `identity.ts`.

**Login** (`POST /api/v1/auth/login`, el mismo endpoint y el mismo body `{ user, password }` que en modo external-auth):

- `user` es un correo si tiene "@", o un nombre de usuario si no. Se busca sin distinguir mayúsculas. Si dos cuentas difieren solo en mayúsculas (dato heredado), el login se rechaza y queda un `warn` con sus UUIDs.
- Las contraseñas se guardan con scrypt (`N=2^14, r=8, p=5`, siempre async), normalizadas a NFKC y con un máximo de 128 caracteres. Si un hash usa parámetros viejos, se rehashea en el próximo login exitoso.
- **Anti-enumeración:** cuenta inexistente, contraseña incorrecta y cuenta sin contraseña responden lo mismo (`401` "Usuario, correo o contraseña incorrectos.") y cuestan lo mismo: sin cuenta, se verifica igual contra un hash ficticio. Una cuenta desactivada responde `403` `account_disabled` solo si la contraseña era correcta. La auditoría (`LOGIN_FAILED`) sí distingue los motivos: `unknown_account`, `wrong_password`, `no_credential`, `account_disabled`.
- El token es un JWT HS256 firmado con `LOCAL_AUTH_JWT_SECRET`: `sub` (id interno), `email`, `iss: "link-local"`, `aud: "link"`, `iat` y `exp` según la duración de sesión vigente. En modo local `user.id` y `user.internalUserId` son el mismo UUID, y los roles salen de `User.localRoles`.
- **Cambio obligatorio:** si un admin restableció la contraseña, si venció, o si no cumple la política vigente, el token sale restringido (`pcr: true`) y la respuesta trae `mustChangePassword: true` con el motivo (`reset`, `expired` o `policy`, en ese orden de prioridad). Ese token solo sirve para `PATCH /auth/password`: el resto de la API responde `403` `password_change_required`, y el socket lo rechaza.

- **Bloqueo por intentos fallidos** (apagado por defecto): con `maxFailedLoginAttempts` configurado, esa cantidad de contraseñas incorrectas seguidas bloquea la cuenta durante `lockoutDurationMinutes`, aunque después llegue la correcta. El contador se incrementa de forma atómica en `LocalCredential` y solo corre con el bloqueo activado; un login exitoso lo reinicia. Una cuenta bloqueada responde `429` con el mismo mensaje que el rate limit, y se audita `LOGIN_FAILED` con motivo `account_locked`.

**Sesión:** no hay refresh. `resolveInternalUser` rechaza un token si la cuenta está desactivada, si es anterior a `User.tokensValidAfter` (se mueve al cambiar o restablecer la contraseña, truncado al segundo) o si es más viejo que la duración de sesión vigente: bajar la duración en la configuración corta las sesiones ya abiertas.

**`GET /api/v1/auth/config`** (público): `{ mode }`, y en modo local además `passwordPolicy` (largo mínimo y máximo, y reglas de composición), lo que el frontend necesita para mostrar las reglas antes de que alguien elija una contraseña. Nunca la duración de sesión.

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
  "token": "<jwt emitido por EXTERNAL_AUTH, reenviado tal cual>",
  "user": {
    "id": "<id externo en EXTERNAL_AUTH>",
    "email": "jdoe@empresa.com",
    "username": "jdoe",
    "fullName": "Juan Doe Pérez",
    "roles": ["admin"],
    "permissions": ["chat.read", "chat.write"],
    "app": "chat-interno",
    "exp": 1735000000,
    "internalUserId": "<uuid local en la tabla User>"
  }
}
```

`internalUserId` es el `id` interno del perfil recién creado/actualizado en la base local (por `upsert` en `email`); es lo que hay que usar para relacionar conversaciones/mensajes, nunca `user.id` (ese es el externo de EXTERNAL_AUTH).

**`user.fullName` sale de la base local (`internalUser.name`), no del JWT tal cual.** Si este usuario ya cambió su nombre acá (ver "Endpoint: cambiar mi nombre" abajo), `User.syncProfileWithIntegration` es `false` y `upsertUsuario()` no lo pisa con lo que diga EXTERNAL_AUTH — pero el JWT de EXTERNAL_AUTH sigue teniendo el nombre viejo. El controller arma la respuesta con `{ ...mappedUser, fullName: internalUser.name, ... }` para que el propio cliente vea siempre el nombre real (el de esta base), nunca el de EXTERNAL_AUTH cuando difieren.

### Errores posibles

| Status | Causa |
|---|---|
| `400` | Falta `user` o `password` en el body |
| `401` | EXTERNAL_AUTH respondió que las credenciales son inválidas |
| `403` | EXTERNAL_AUTH respondió `403` (o un error con "forbidden"). **Ojo:** EXTERNAL_AUTH usa este mismo status tanto para credenciales incorrectas como para falta de acceso a esta `app` — no hay forma de distinguir el motivo real desde acá, así que el mensaje que ve el usuario es genérico a propósito ("revisá tus credenciales... si persiste, contactá a un administrador"), nunca "no tenés acceso" |
| `429` | Se agotó el cupo de intentos de login — por usuario (5 cada 15 min, `loginUserRateLimiter`) o por IP (20 cada 15 min, `loginIpRateLimiter`), ver `rate-limit.middleware.ts` |
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

`User.syncProfileWithIntegration` (`schema.prisma`, default `true`) decide si el login (y la sincronización de contactos vía `syncAppUsers`, ver más abajo) sigue actualizando `name`/avatar desde el proveedor de identidad externo configurado — hoy EXTERNAL_AUTH, pero el mecanismo no asume cuál; podría ser cualquier otro mañana sin tocar este flag. Pasa a `false` automáticamente la primera vez que el usuario cambia su nombre o su foto **acá** (`auth.service.ts`: `updateOwnName`/`setProfilePicture`/`removeProfilePicture`, todas vía `setLocalName`/`setLocalAvatar` en `auth.repository.ts`) — desde ese momento esos dos campos viven únicamente en esta base: ni el login ni `syncAppUsers` vuelven a pisarlos con lo que diga el proveedor externo, sin importar cuántas veces ese usuario inicie sesión.

`upsertUserFromExternalUser()` (`auth.repository.ts`) es quien aplica esto: no es un `upsert` directo porque la condición ("¿sigo sincronizando?") depende de la fila ya existente — primero busca por `email`, y solo incluye `name` en el `update` si `syncProfileWithIntegration` seguía en `true`. `username`/`externalId` no son campos de "perfil" (no los edita el usuario) y siempre se actualizan, sync esté prendido o no.

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

Esta foto llega a la base de dos formas, y ambas conviven: (1) sincronizada desde el proveedor externo en cada login o al refrescar el directorio de contactos, mientras `syncProfileWithIntegration` siga en `true` (ver sección arriba); o (2) subida acá mismo vía `PUT` (abajo), que apaga ese sync. Para la foto de **otros** usuarios (no la propia), ver "Endpoint: foto de perfil de un tercero" más abajo — ese sigue siendo el único camino que todavía pega contra el proveedor externo en este módulo.

## Endpoint: foto de perfil de un tercero (uso interno, sin proxy propio)

```
GET /v1/profile/picture/:username
```

A diferencia del anterior, EXTERNAL_AUTH identifica al usuario por `username` en la URL, no por el token — puede traer la foto de **cualquier** usuario de la app, no solo la de quien está autenticado. No hay una ruta HTTP propia que lo exponga (no hace falta: nada en el frontend necesita pedir la foto de un tercero en tiempo real) — solo lo usa `getProfilePictureByUsername()`/`syncContactAvatar()` en `auth.service.ts`, server-to-server, para cachear localmente el avatar de contactos que `syncAppUsers()` trae de `GET /v1/apps/users/by-codes` (ver "Endpoint: contactos de la app" abajo) y que todavía no iniciaron sesión acá. Mismo formato de respuesta y mismo mapeo de errores que el `GET` de arriba (data URI, `USER_NOT_FOUND`/`PROFILE_PICTURE_NOT_FOUND` → 404 local).

## Endpoint: contactos de la app

```
GET /v1/apps/users/by-codes?codes=<APP_CODE_EXTERNAL_AUTH>
```

Devuelve todos los usuarios de EXTERNAL_AUTH con acceso a esta app (identificada por `APP_CODE_EXTERNAL_AUTH`), hayan iniciado sesión acá alguna vez o no — a diferencia del directorio local (`GET /api/v1/users`), que hasta ahora solo listaba a quien ya se había logueado. `AuthService.getAppUsers()` lo llama y `AuthService.syncAppUsers()` (invocado desde `UserService.listUsers()` en cada `GET /api/v1/users`) upsertea cada uno como `User` local — necesario porque `createConversation` exige que el otro miembro ya exista localmente — y cachea su foto si todavía no tiene una **y** su `syncProfileWithIntegration` sigue en `true` (si esa persona ya editó su nombre/foto acá, aunque sea desde otra sesión, `upsertUserFromExternalUser` no le pisa el nombre y este paso ni intenta traerle una foto nueva). Si EXTERNAL_AUTH no responde, `syncAppUsers()` no lanza: el directorio simplemente se sirve con lo que ya había en la base local.

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

`authenticate` lo revalida contra `EXTERNAL_AUTH_JWT_SECRET` (algoritmo fijado a HS256) en cada request — no hay sesión propia — y llena `req.user` con la misma forma que `user` en la respuesta del login (sin `internalUserId`). Si el token expiró devuelve `401` con "Token expired"; si es inválido, "Invalid token".
