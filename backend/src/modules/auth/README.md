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

A diferencia de `/login`, este sí requiere `Authorization: Bearer <token>` — es el único endpoint de este módulo detrás de `authenticate`. Proxea `GET /api/v1/profile/picture` de EXTERNAL_AUTH (`auth.service.ts`, `getProfilePicture()`): reenvía el mismo token recibido, y devuelve la imagen tal cual (bytes + `Content-Type` de EXTERNAL_AUTH), no JSON.

```bash
curl http://localhost:4000/api/v1/auth/profile/picture \
  -H "Authorization: Bearer <token>" \
  --output foto.jpg
```

**Por qué solo trae "mi" foto y no la de otro usuario**: EXTERNAL_AUTH identifica a quién pertenece la foto exclusivamente por el token — su endpoint no acepta un id de usuario como parámetro. Este proxy hereda esa misma limitación: sirve para mostrar la foto de quien está logueado (ej. en `UserMenu`), pero no hay forma de pedir la foto de otro miembro de una conversación a través de este mecanismo.

No se cachea del lado del backend (cada request vuelve a pedirle a EXTERNAL_AUTH), pero sí manda `Cache-Control: private, max-age=300` para que el navegador no repita el request en cada render de `<Avatar>`.

| Status | Causa |
|---|---|
| `401` | Token inválido o expirado |
| `404` | El usuario no tiene foto cargada en EXTERNAL_AUTH |
| `503` | EXTERNAL_AUTH no respondió (caído, timeout de 5s) |

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
