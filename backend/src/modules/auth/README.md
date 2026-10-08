# Auth

Autenticación de la instalación, con cuentas locales o con un proveedor externo ([LOCAL_AUTH_PLAN.md](../../../../docs/design/LOCAL_AUTH_PLAN.md) y [`docs/auth-providers.md`](../../../../docs/auth-providers.md)):

- **Proveedor externo** (`AUTH_PROVIDER_MODULE`): este módulo no administra usuarios ni contraseñas. Le pide al proveedor que valide las credenciales **solo en el login**, sincroniza el perfil local (`User`) y sus roles con lo que el proveedor devuelve, y emite la sesión de LINK (ver abajo).
- **`local`** (sin proveedor): las cuentas y sus contraseñas viven en esta base (`LocalCredential`, separada de `User`). Ver [Modo local](#modo-local).

**La sesión es siempre la de LINK:** con cualquier proveedor, el token que usa el cliente en cada request lo firma LINK (`signSessionToken`, HS256 con `SESSION_JWT_SECRET`, `iss`/`aud` `link`). El token del proveedor externo nunca llega al cliente y no autentica ninguna request, ni el socket, ni las descargas.

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

**Qué proveedor hay** lo guarda `src/auth-providers/registry.ts` (`getAuthProvider()`, `isExternalProvider()`, `currentProviderId()`, `requireLocalAuth()`) y lo fija `initAuthProvider()` (`init.ts`) en `server.ts`, antes de escuchar: si la configuración del proveedor es inválida, el backend no arranca. Sin proveedor configurado, cuentas locales.

**Cómo se elige y se carga** (`init.ts`, `loader.ts`): `AUTH_PROVIDER_MODULE` (ruta absoluta o nombre de paquete) señala el módulo del proveedor; el loader lo importa, acepta `createAuthProvider(ctx)`, un default o un objeto, valida `id` (minúsculas, dígitos, `-` y `_`; `local` está reservado), `displayName`, `apiVersion` (tiene que ser `AUTH_PROVIDER_API_VERSION`) y las operaciones, y llama a `init`. Cualquier falla es un `AuthProviderLoadError` con un mensaje que dice qué mirar, y el backend no arranca. El proveedor de ejemplo (`src/auth-providers/example/`) se prueba con el loader real. Guía para escribir uno: [`docs/auth-providers.md`](../../../../docs/auth-providers.md).

**Reconocer a la persona** (`upsertExternalUser`, `auth.repository.ts`): primero por `externalId`, si no por correo exacto y si no por correo sin distinguir mayúsculas. Al reconocerla por correo se completan `identityProvider` y `externalId` si estaban vacíos: así una cuenta creada en modo local conserva su `User.id` al pasar a un proveedor externo.

Con cualquier proveedor hay un solo verificador de tokens (`verifyAccessToken`, `jwt.ts`) y una sola resolución contra la base (`resolveInternalUser`, `identity.ts`), que usan los middlewares HTTP, el socket y `/files/:id/content`: busca la cuenta por id, rechaza las desactivadas, las revocadas (`tokensValidAfter`) y las que superan la duración de sesión vigente, y toma nombre, username y **roles** de la fila (`User.roles`). Una cuenta con `status: INACTIVE` no entra con ningún proveedor, aunque este acepte su contraseña.

## Variables de entorno

`src/config/env.ts` valida `DATABASE_URL`, `SESSION_JWT_SECRET` y el resto de la configuración de LINK. Las variables de un proveedor externo no las conoce `env.ts`: las lee y valida el propio proveedor en `init()`.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (siempre requerida) |
| `SESSION_JWT_SECRET` | Obligatoria con cualquier proveedor: secreto para firmar las sesiones de LINK (HS256), de 32 caracteres o más. `LOCAL_AUTH_JWT_SECRET`, su nombre anterior, se sigue aceptando con un aviso al arrancar |
| `AUTH_PROVIDER_MODULE` | Opcional: ruta absoluta (o paquete) del módulo de un proveedor de autenticación externo. Sin definir, cuentas locales |
| `PORT` | Opcional, puerto del servidor (default `4000`) |

El código del core pregunta si hay un proveedor externo (`isExternalProvider()`); las rutas y los servicios que solo tienen sentido con cuentas locales usan `requireLocalAuth()` (`503` `local_auth_not_enabled` con un proveedor externo) o el middleware `localAuthOnly()` (`404`).

## Modo local

Todo lo de esta sección aplica solo sin `AUTH_PROVIDER_MODULE` en el `.env`. Código: `local-auth.service.ts`, `password.ts`, `jwt.ts` (`signSessionToken`) e `identity.ts`.

**Login** (`POST /api/v1/auth/login`, el mismo endpoint y el mismo body `{ user, password }` que con un proveedor externo):

- `user` es un correo si tiene "@", o un nombre de usuario si no. Se busca sin distinguir mayúsculas. Si dos cuentas difieren solo en mayúsculas (dato heredado), el login se rechaza y queda un `warn` con sus UUIDs.
- Las contraseñas se guardan con scrypt (`N=2^14, r=8, p=5`, siempre async), normalizadas a NFKC y con un máximo de 128 caracteres. Si un hash usa parámetros viejos, se rehashea en el próximo login exitoso.
- **Anti-enumeración:** cuenta inexistente, contraseña incorrecta y cuenta sin contraseña responden lo mismo (`401` "Usuario, correo o contraseña incorrectos.") y cuestan lo mismo: sin cuenta, se verifica igual contra un hash ficticio. Una cuenta desactivada responde `403` `account_disabled` solo si la contraseña era correcta. La auditoría (`LOGIN_FAILED`) sí distingue los motivos: `unknown_account`, `wrong_password`, `no_credential`, `account_disabled`.
- El token es un JWT HS256 firmado con `SESSION_JWT_SECRET`: `sub` (id interno), `email`, `iss: "link"`, `aud: "link"`, `iat` y `exp` según la duración de sesión vigente. `user.id` y `user.internalUserId` son el mismo UUID, y los roles salen de `User.roles`.
- **Cambio obligatorio:** si un admin restableció la contraseña, si venció, o si no cumple la política vigente, el token sale restringido (`pcr: true`) y la respuesta trae `mustChangePassword: true` con el motivo (`reset`, `expired` o `policy`, en ese orden de prioridad). Ese token solo sirve para `PATCH /auth/password`: el resto de la API responde `403` `password_change_required`, y el socket lo rechaza.

- **Bloqueo por intentos fallidos** (apagado por defecto): con `maxFailedLoginAttempts` configurado, esa cantidad de contraseñas incorrectas seguidas bloquea la cuenta durante `lockoutDurationMinutes`, aunque después llegue la correcta. El contador se incrementa de forma atómica en `LocalCredential` y solo corre con el bloqueo activado; un login exitoso lo reinicia. Una cuenta bloqueada responde `429` con el mismo mensaje que el rate limit, y se audita `LOGIN_FAILED` con motivo `account_locked`.

**Sesión:** no hay refresh. `resolveInternalUser` rechaza un token si la cuenta está desactivada, si es anterior a `User.tokensValidAfter` (se mueve al cambiar o restablecer la contraseña, truncado al segundo) o si es más viejo que la duración de sesión vigente: bajar la duración en la configuración corta las sesiones ya abiertas.

**`GET /api/v1/auth/config`** (público): `provider` (`id`, `displayName`, `external`) y `capabilities` (`passwordChange`, `accountManagement`: `full` o `status-only`), y con cuentas locales además `passwordPolicy` (largo mínimo y máximo, y reglas de composición), lo que el frontend necesita para mostrar las reglas antes de que alguien elija una contraseña. El frontend decide qué mostrar por `capabilities`, nunca por el nombre del proveedor. Nunca la duración de sesión.

**`PATCH /api/v1/auth/password`** (solo con cuentas locales; `404` con un proveedor externo): `{ currentPassword, newPassword }` → `{ token, exp }`. Acepta el token restringido. Rechaza con `400` y `code` (nunca `401`, que el frontend interpreta como sesión vencida): `invalid_current_password`, `password_policy` (con `rules`, la lista de reglas que no cumple) o `password_reused` (la nueva es igual a la actual o, con historial, a una de las últimas N). La contraseña saliente pasa a `previousPasswordHashes`, podado a N-1. Revoca todos los tokens anteriores, corta los sockets abiertos y audita `CHANGE_PASSWORD` con el motivo (`voluntary`, `reset` o `policy`). Rate limit propio: 5 intentos fallidos cada 15 minutos por cuenta.

**Cuentas:** las crea un admin desde el panel (`POST /api/v1/admin/users`, ver [`users`](../users/README.md)), o con el CLI para el primer admin y las emergencias: `npm run auth:admin -- create-admin --email <correo>` y `npm run auth:admin -- reset-password --email <correo>`. La contraseña temporal sale una sola vez por la terminal (nunca por el logger) y deja el cambio obligatorio.

**Política de contraseñas:** la configura un admin en *Configuración global* (`settings`), no el `.env`: duración de sesión (1 a 720 horas, default 12; rige con cualquier proveedor), largo mínimo (8 a 128, default 12), cuatro reglas de composición, vencimiento (1 a 365 días), historial (0 a 12, contando la actual) y bloqueo (3 a 50 intentos, de 1 a 1440 minutos). Todo apagado por defecto salvo el largo mínimo. El piso de 8 caracteres no se puede bajar. Endurecer la política no corta sesiones: se aplica en el próximo login de cada cuenta.

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
  "token": "<sesión de LINK: JWT propio firmado con SESSION_JWT_SECRET, no el del proveedor>",
  "user": {
    "id": "<uuid local en la tabla User, igual a internalUserId>",
    "email": "jdoe@empresa.com",
    "username": "jdoe",
    "fullName": "Juan Doe Pérez",
    "roles": ["admin"],
    "exp": 1735000000,   // vencimiento de la sesión de LINK
    "internalUserId": "<uuid local en la tabla User>",
    "authProvider": "local"
  }
}
```

`internalUserId` es el `id` interno del perfil recién creado/actualizado en la base local (ver "Reconocer a la persona"); es lo que hay que usar para relacionar conversaciones/mensajes. `user.id` es el mismo valor: el id de la persona en el proveedor externo no sale del backend. Es también el `sub` de la sesión de LINK. `authProvider` es `local` o el `id` del proveedor.

**Roles:** en cada login con un proveedor externo se guardan en `User.roles` los roles que entrega el proveedor y que la app conoce (`filterKnownRoles`, hoy solo `admin`); los demás se descartan. De ahí en más se leen de la base en cada request, como con cuentas locales, así que cambiar los roles en el proveedor se refleja en el próximo login, no antes. `user.roles` en la respuesta son los guardados.

**`user.fullName` sale de la base local (`record.name`), no de lo que informa el proveedor.** Si este usuario ya cambió su nombre acá (ver "Endpoint: cambiar mi nombre" abajo), `User.syncProfileWithIntegration` es `false` y `upsertExternalUser()` no lo pisa con lo que diga el proveedor: la respuesta se arma con la cuenta guardada para que el propio cliente vea siempre el nombre real (el de esta base), nunca el del proveedor cuando difieren.

### Errores posibles

| Status | Causa |
|---|---|
| `400` | Falta `user` o `password` en el body |
| `401` | Las credenciales son inválidas (`invalid_credentials`) |
| `403` | El proveedor rechazó a la persona (`access_denied`), o la cuenta está desactivada en LINK (`code: "account_disabled"`). **Ojo:** muchos proveedores usan el mismo rechazo para credenciales incorrectas y para falta de acceso a esta aplicación — no hay forma de distinguir el motivo real desde acá, así que el mensaje que ve el usuario es genérico a propósito ("revisá tus credenciales... si persiste, contactá a un administrador"), nunca "no tenés acceso" |
| `429` | Se agotó el cupo de intentos de login (solo cuentan los fallidos) — por usuario e IP (5 cada 15 min, `loginUserIpRateLimiter`), por usuario desde cualquier IP (20 cada 15 min, `loginUserRateLimiter`) o por IP (20 cada 15 min, `loginIpRateLimiter`), ver `rate-limit.middleware.ts` |
| `503` | El proveedor no respondió (caído, o más de 10 s: `provider_unreachable`) o devolvió algo inesperado (`provider_error`) |

### Auditoría de autenticación

Cada intento de autenticación se registra en el audit trail normativo (`AuditLog`):
- **Login exitoso (`LOGIN`)**: Se registra con `userId` (el ID interno del usuario en la base local), `actorEmail` (el email resuelto), `ip`, `userAgent` y `requestId`, y en la metadata `provider` (`local` o el id del proveedor). No contiene metadata sensible.
- **Login fallido (`LOGIN_FAILED`)**: Se registra con `userId: null`, `actorEmail` (el usuario o email enviado en el intento), `ip`, `userAgent`, `requestId` y la razón técnica en metadata (`{ provider, reason: "forbidden_by_provider" | "invalid_credentials" | "provider_error" | "provider_unreachable" | "account_disabled" }`, más los del modo local).
- **Ambigüedad del rechazo del proveedor**: `forbidden_by_provider` refleja que el proveedor rechazó a la persona (`access_denied`). Como muchos proveedores no distinguen entre "contraseña incorrecta" y "usuario sin permisos para esta app", este valor **no** debe interpretarse de forma taxativa como contraseña errónea.
- **Privacidad estricta**: Las contraseñas, tokens y respuestas completas del proveedor **nunca** se almacenan en la tabla de auditoría ni en los logs de aplicación.

### IP del cliente

El proveedor recibe la IP del cliente real en `CredentialsInput.clientIp` (tomada de `CF-Connecting-IP` solo con `TRUST_CF_CONNECTING_IP`, o de `req.ip`; ver `config/client-ip.ts`), por si su sistema aplica límites o bloqueos por IP y no quiere que caigan sobre la IP del servidor de chat (lo que generaría un bloqueo general para todos los usuarios ante fallos reiterados).

## Desacoplar el perfil del proveedor externo (`syncProfileWithIntegration`)

`User.syncProfileWithIntegration` (`schema.prisma`, default `true`) decide si el login (y la sincronización de contactos que hace el proveedor en `onLogin`, ver más abajo) sigue actualizando `name`/avatar desde el proveedor de identidad externo configurado. Pasa a `false` automáticamente la primera vez que el usuario cambia su nombre o su foto **acá** (`auth.service.ts`: `updateOwnName`/`setProfilePicture`/`removeProfilePicture`, todas vía `setLocalName`/`setLocalAvatar` en `auth.repository.ts`) — desde ese momento esos dos campos viven únicamente en esta base: ni el login ni la sincronización de contactos vuelven a pisarlos con lo que diga el proveedor externo, sin importar cuántas veces ese usuario inicie sesión.

`upsertExternalUser()` (`auth.repository.ts`) es quien aplica esto: no es un `upsert` directo porque la condición ("¿sigo sincronizando?") depende de la fila ya existente — primero busca a la persona (ver "Reconocer a la persona"), y solo incluye `name` en el `update` si `syncProfileWithIntegration` seguía en `true`. `username` no es un campo de "perfil" (no lo edita el usuario) y siempre se actualiza, sync esté prendido o no. El avatar lo guarda `setAvatarFromProvider()` (`auth.service.ts`), que respeta el mismo flag y no reescribe el archivo si el checksum no cambió.

## Endpoint: foto de perfil

```
GET /api/v1/auth/profile/picture
```

Requiere `Authorization: Bearer <token>` + `attachInternalUser`. No proxea a ningún proveedor externo: lee `avatarFileId` de la base local (`AuthService.getOwnProfilePictureUrl()`) y responde `302` a `/api/v1/files/<avatarFileId>/content` (mismo endpoint seguro de contenido que sirve el avatar de cualquier otro usuario). `404` si todavía no tiene ninguna foto cacheada.

```bash
curl -L http://localhost:4000/api/v1/auth/profile/picture \
  -H "Authorization: Bearer <token>" \
  --output foto.jpg
```

Al ser un redirect a una URL propia por archivo (`/api/v1/files/<avatarFileId>/content`), no hace falta el `Vary: Authorization` que haría falta si este endpoint sirviera bytes directamente desde una URL literal única para todos.

Esta foto llega a la base de dos formas, y ambas conviven: (1) sincronizada desde el proveedor externo (la propia en cada login, y la de los contactos al sincronizar el directorio, que también ocurre en el login), mientras `syncProfileWithIntegration` siga en `true` (ver sección arriba); o (2) subida acá mismo vía `PUT` (abajo), que apaga ese sync.

## Sincronización de avatar y directorio (`onLogin`)

Es cosa del proveedor, no de una ruta HTTP: el proveedor puede traer fotos y la lista de personas con acceso a la aplicación en su `onLogin`, con credenciales que solo existen en el momento del login (por ejemplo, el token de su sistema, que le pasa a `onLogin` en `providerData`). Usa el `ProviderContext`:

- `ctx.users.upsertExternalUser(user)` guarda a cada persona como `User` local, hayan iniciado sesión acá alguna vez o no — necesario porque `createConversation` exige que el otro miembro ya exista localmente. No toca su estado ni sus roles.
- `ctx.users.listWithoutAvatar()` lista a quienes todavía no tienen foto **y** cuyo `syncProfileWithIntegration` sigue en `true` (si esa persona ya editó su nombre o foto acá, aunque sea desde otra sesión, no se le pide una foto nueva).
- `ctx.users.setAvatarFromProvider(userId, image | null)` la guarda (o la quita).

`GET /api/v1/users` y `GET /api/v1/admin/users` son lecturas puras de la base de LINK y no llaman a ningún proveedor. El throttle de la sincronización del directorio (para no repetirla en cada login) lo lleva el propio proveedor.

## Endpoint: cambiar/quitar mi foto de perfil

```
PUT    /api/v1/auth/profile/picture
DELETE /api/v1/auth/profile/picture
```

Requieren `attachInternalUser` además de `authenticate` (`auth.route.ts`): cachean/limpian la foto como `StoredFile` propio, lo que necesita el `internalUserId`, no solo el token. **Ninguna de las dos toca el proveedor externo** — son 100% locales, a propósito (ver "Desacoplar el perfil del proveedor externo" arriba). Ambas apagan `syncProfileWithIntegration` para este usuario.

**`PUT`** recibe `multipart/form-data` con un campo `file` (imagen, límite propio de 5 MB — más chico que `MAX_UPLOAD_SIZE_MB` de adjuntos, definido en `auth.route.ts`; sigue siendo razonable para un avatar). El controller (`updateProfilePicture`) llama a `AuthService.setProfilePicture(userId, buffer, mimeType)`, que guarda el buffer como `StoredFile` (`FileService.storeAvatar`) y apunta `User.avatarFileId` ahí vía `setLocalAvatar()` (`auth.repository.ts`) — la misma función que apaga el flag. Devuelve el `StoredFileResponse` resultante (`200`).

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

`authenticate` lo verifica contra `SESSION_JWT_SECRET` (HS256 fijado, `iss` y `aud` `link`) en cada request, sin consultar al proveedor, y llena `req.user` con la identidad del token (`attachInternalUser` la completa desde la base, con `internalUserId`). Si el token expiró devuelve `401` con "Token expired"; si es inválido —incluido el token de un proveedor externo—, "Invalid token".
