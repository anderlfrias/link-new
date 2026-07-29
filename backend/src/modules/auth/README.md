# Auth (EXTERNAL_AUTH)

Este módulo no administra usuarios ni contraseñas: reenvía credenciales al microservicio **EXTERNAL_AUTH**, verifica el JWT que este emite y sincroniza el perfil local (`User`) con lo que EXTERNAL_AUTH devuelve. El backend nunca emite su propio token: el que usa el cliente en cada request es siempre el de EXTERNAL_AUTH.

## Variables de entorno requeridas

Definidas y validadas en `src/config/env.ts` (el servidor no arranca si falta alguna):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `EXTERNAL_AUTH_API_URL` | URL base de EXTERNAL_AUTH, **sin** el sufijo `/v1/login` (ej. `https://external-auth.midominio.com`) |
| `APP_CODE_EXTERNAL_AUTH` | Código de esta aplicación registrado en EXTERNAL_AUTH |
| `EXTERNAL_AUTH_JWT_SECRET` | Secreto compartido para verificar (HS256) los JWT que emite EXTERNAL_AUTH |
| `PORT` | Opcional, puerto del servidor (default `4000`) |

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

### Errores posibles

| Status | Causa |
|---|---|
| `400` | Falta `user` o `password` en el body |
| `401` | EXTERNAL_AUTH respondió que las credenciales son inválidas |
| `403` | EXTERNAL_AUTH respondió `403` (o un error con "forbidden") — el usuario existe pero no tiene acceso a esta `app` |
| `429` | Más de 10 intentos de login en 15 minutos desde la misma IP (`rate-limit.middleware.ts`) |
| `503` | EXTERNAL_AUTH no respondió (caído, timeout de 5s) o devolvió un status inesperado (5xx u otro distinto de `200`/`401`/`403`) |

## Endpoint: foto de perfil

```
GET /api/v1/auth/profile/picture
```

A diferencia de `/login`, este sí requiere `Authorization: Bearer <token>` de parte del cliente — es el único endpoint de este módulo detrás de `authenticate`. Proxea `GET /api/v1/profile/picture` de EXTERNAL_AUTH (`auth.service.ts`, `getProfilePicture()`) y devuelve la imagen ya como bytes + `Content-Type`, no JSON.

```bash
curl http://localhost:4000/api/v1/auth/profile/picture \
  -H "Authorization: Bearer <token>" \
  --output foto.jpg
```

**Detalle importante al reenviar el token a EXTERNAL_AUTH**: a EXTERNAL_AUTH *no* se le manda el prefijo `Bearer `. Su controller decodifica el header tal cual con `jwt-decode` (`const token = req.headers.authorization; jwtDecode(token)`), sin recortar ningún prefijo — si se le manda `Bearer <jwt>`, el decode falla y EXTERNAL_AUTH cae a su bloque `catch` (`500 ERROR_FETCHING_PROFILE_PICTURE`), que este proxy traduce como `503`. Por eso `getProfilePicture()` reenvía `Authorization: <token>` a secas (solo hacia EXTERNAL_AUTH; el cliente sigue mandando `Bearer <token>` a este backend como siempre).

**Detalle importante sobre la respuesta de EXTERNAL_AUTH**: tampoco devuelve bytes crudos con un `Content-Type` de imagen — su `res.ok(user.profilePicture)` manda el data URI completo como body (`"data:image/jpeg;base64,/9j/4AAQ..."`, a veces envuelto en comillas de JSON según negotiation). `getProfilePicture()` parsea ese data URI con una regex, separa el `contentType` real y decodifica el base64 a `Buffer` antes de devolverlo — así el controller sí puede responder con bytes + `Content-Type` correctos hacia el cliente.

**Mapeo de errores de EXTERNAL_AUTH**: no hay un `401` explícito — `USER_ID_REQUIRED`, `USER_NOT_FOUND` y `PROFILE_PICTURE_NOT_FOUND` llegan todos como `400` (`res.badRequest`) con un `code` distinto en el body; un token realmente inválido rompe el `jwtDecode` y cae en el `catch` genérico (`500`). `getProfilePicture()` lee el `code` del body: `USER_NOT_FOUND`/`PROFILE_PICTURE_NOT_FOUND` → `404` local; cualquier otro no-`ok` → `503`.

**Por qué manda `Vary: Authorization`**: la respuesta también trae `Cache-Control: private, max-age=300` para no repetir el proxy en cada render de `<Avatar>` — pero la caché HTTP del navegador solo distingue entradas por URL, no por el valor de `Authorization`, a menos que el header `Vary` lo indique. Sin `Vary: Authorization`, si un usuario cierra sesión y otro inicia sesión en la misma pestaña dentro de esos 300s, un fetch a esta misma URL con OTRO token puede devolver de caché los bytes de la foto del usuario anterior (bug real, reportado y corregido). Con `Vary: Authorization`, el navegador guarda una entrada de caché distinta por token, así que el cacheo sigue funcionando para el mismo usuario pero nunca se filtra entre usuarios distintos.

**Por qué solo trae "mi" foto y no la de otro usuario**: EXTERNAL_AUTH identifica a quién pertenece la foto exclusivamente por el token — su endpoint no acepta un id de usuario como parámetro. Este proxy hereda esa misma limitación: solo sirve para que un usuario pida su propia foto (ej. `UserMenu`). Para mostrar la foto de **otros** usuarios (lista de contactos, miembros de una conversación) no se puede volver a llamar a EXTERNAL_AUTH — en vez de eso, cada usuario cachea su propia foto como `StoredFile` la primera vez que él mismo inicia sesión (`syncProfilePicture` en `auth.service.ts`, ver `modules/files/README.md`), y de ahí en adelante se sirve desde nuestro propio storage para cualquiera que la necesite.

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

A diferencia de `GET` (arriba), estas dos sí necesitan `attachInternalUser` además de `authenticate` (`auth.route.ts`): cachean/limpian la foto como `StoredFile` propio, lo que requiere el `internalUserId`, no solo el token.

**`PUT`** recibe `multipart/form-data` con un campo `file` (imagen, límite propio de 5 MB — más chico que `MAX_UPLOAD_SIZE_MB` de adjuntos, definido en `auth.route.ts` porque EXTERNAL_AUTH guarda esto como texto, no como archivo). El controller (`updateProfilePicture`) arma un data URI (`data:<mimeType>;base64,<...>`) desde el buffer subido y llama a `AuthService.setProfilePicture(userId, token, buffer, mimeType)`, que:

1. Manda ese data URI a EXTERNAL_AUTH vía `PUT /v1/profile/picture` (`{ profilePicture: dataUri }` en el body, mismo formato que devuelve `GET` — simétrico, EXTERNAL_AUTH lo guarda tal cual sin transformarlo). Igual que `GET`, el `Authorization` hacia EXTERNAL_AUTH va sin el prefijo `Bearer `.
2. Solo si eso funciona, cachea el mismo buffer localmente (`FileService.storeAvatar` + `updateAvatarFileId` — la misma función interna, `cacheAvatarLocally()`, que ya usa `syncProfilePicture()` en el login) y devuelve el `StoredFileResponse` resultante (`200`).

Si el `PUT` a EXTERNAL_AUTH falla, no se toca la caché local — nunca queda desincronizada con lo que EXTERNAL_AUTH realmente tiene guardado.

**`DELETE`** no manda body. Llama a `AuthService.removeProfilePicture(userId, token)`: borra la foto en EXTERNAL_AUTH (`DELETE /v1/profile/picture` — endpoint agregado por el equipo de EXTERNAL_AUTH siguiendo la misma estructura que `GET`/`PUT`, con el mismo mapeo de errores conservador) y, si eso funciona, limpia `avatarFileId` a `null` localmente. Responde `204`.

No importa si la imagen del `PUT` viene de un archivo real elegido por el usuario o de un avatar de [Boring Avatars](https://boringavatars.com) rasterizado a PNG en el frontend (ver `frontend/src/features/profile`) — el endpoint no distingue entre ambos, siempre es "un archivo de imagen".

| Status | Causa |
|---|---|
| `400` | Falta el archivo (`PUT`), o el tipo de imagen no está permitido |
| `404` | EXTERNAL_AUTH respondió `USER_NOT_FOUND` |
| `503` | EXTERNAL_AUTH no respondió (caído, timeout de 5s) o devolvió un `code` inesperado |

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
