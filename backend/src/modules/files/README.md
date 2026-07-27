# Files

Sube, sirve metadata de, y borra `StoredFile` (`prisma/schema.prisma`) — el único modelo de archivo de todo el sistema (ver [backend/README.md, "Gestión de Archivos"](../../../README.md#gestión-de-archivos)). Un `StoredFile` no pertenece a ninguna conversación ni mensaje en particular: por eso este módulo es un recurso plano (`/api/v1/files`, no anidado bajo `conversations`), y `conversations` (`imageFileId`) y `messages` (`fileIds`) simplemente referencian por `id` los archivos que ya subiste acá.

Este módulo no decide **cómo ni dónde** se guarda físicamente un archivo — eso es trabajo de [`src/storage`](../../storage) (`StorageProvider`). Este módulo decide **qué es un archivo válido** (tipo, tamaño, quién lo subió) y mantiene la fila de `StoredFile`.

## Endpoints

Base: `/api/v1/files`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Sube un archivo (`multipart/form-data`, campo `file`, `conversationId` opcional). |
| `GET` | `/:id` | Metadata del archivo (incluye `url`). |
| `DELETE` | `/:id` | Borrado lógico (solo quien lo subió). |

Todas requieren autenticación (`authenticate` + `attachInternalUser`), igual que `conversations`/`messages`.

### `POST /` — Subir

```bash
curl -X POST http://localhost:4000/api/v1/files \
  -H "Authorization: Bearer <token>" \
  -F "file=@/ruta/local/foto.jpg" \
  -F "conversationId=<uuid-de-la-conversación>"
```

`conversationId` es opcional y **solo afecta dónde se guarda el archivo en disco** (ver más abajo) — no crea ninguna relación en la base; la única relación real la crea después `messages` (`fileIds`) o `conversations` (`imageFileId`) al referenciar este `id`.

Validaciones, en este orden:
1. **Tipo MIME** contra el allowlist de [`ALLOWED_MIME_TYPES`](../../constants/allowed-file-types.constant.ts) (imágenes comunes, PDF, texto plano, Office, zip) — `400` si no está permitido. Se rechaza en el propio middleware de `multer` (`file.route.ts`), antes de leer el body completo.
2. **Tamaño** contra `MAX_UPLOAD_SIZE_MB` (`.env`, default 25 MB) — lo hace `multer` directamente; si se excede, lanza un `MulterError` que el error handler global (`middlewares/error.middleware.ts`) traduce a `400` (no es un `AppError`, por eso necesita ese caso especial).
3. **Membresía**, solo si mandaste `conversationId`: `403` si no sos miembro de esa conversación. Sin este chequeo, cualquiera podría namespacear archivos bajo una conversación ajena.

Respuesta `201`:
```json
{
  "id": "<uuid>",
  "originalName": "foto.jpg",
  "mimeType": "image/jpeg",
  "extension": "jpg",
  "size": 245678,
  "url": "/uploads/chat/<conversationId>/2026/07/9f2b3c1a-....jpg",
  "createdAt": "2026-07-23T20:00:00.000Z"
}
```

`url` la construye el `StorageProvider` activo a partir de la ruta relativa guardada en `StoredFile.path` — nunca se expone `path` ni `storedName` (rutas físicas) directamente en la respuesta.

### Organización en disco (`buildStorageDir()` en `file.service.ts`)

Para no acumular todos los archivos sueltos en una única carpeta plana, cada subida se namespacea por conversación y por año/mes de subida:

* Con `conversationId`: `chat/<conversationId>/<yyyy>/<mm>/<uuid>.<ext>`.
* Sin `conversationId` (subida sin destino conocido todavía, ej. futuro avatar de usuario): `chat/<yyyy>/<mm>/<uuid>.<ext>`.

El nombre físico (`storedName`) sigue siendo siempre un UUID — la carpeta agrupa, pero no reemplaza la garantía de "nombre no adivinable" (ver más abajo).

### `GET /:id`

Misma forma que la respuesta de `POST /`. `404` si no existe o está borrado lógicamente. No verifica que el archivo esté "en uso" por algo que el usuario pueda ver — el archivo físico ya es servible sin autenticación vía `/uploads/...` (montado en `app.ts`), así que este endpoint solo expone la misma información por otra vía, no agrega un permiso nuevo.

### `DELETE /:id`

Borrado lógico (`deletedAt`) — igual que `Conversation`/`Message` en el resto del sistema. Solo quien subió el archivo (`403` para cualquier otro). **No borra el archivo físico ni verifica si sigue referenciado** (por un mensaje, una conversación o un usuario) — limpiar archivos huérfanos en disco es trabajo de un job de background (`src/workers`, todavía no existe), no de este endpoint.

## Por qué la extensión nunca sale del nombre original tal cual

`safeExtension()` (`file.service.ts`) intenta usar la extensión del nombre original **solo si** es alfanumérica simple (`^[a-z0-9]{1,10}$`); si no, cae al mapeo por tipo MIME en `ALLOWED_MIME_TYPES`, y si tampoco hay match, a `"bin"`. El nombre físico (`storedName`) siempre es un UUID generado acá, nunca el nombre que mandó el cliente — por eso no hay riesgo de path traversal ni de colisión, sin necesidad de sanitizar rutas en `src/storage`.

## Qué falta a propósito

* **Avatar de usuario** (`User.avatarFileId`): no hay todavía un módulo `users` con un endpoint para setearlo — cuando exista, solo necesita guardar el `id` que devuelve este módulo, igual que ya hacen `conversations` y `messages`.
* **Limpieza de archivos huérfanos**: un `StoredFile` borrado lógicamente, o nunca referenciado por nada, no se borra físicamente. Candidato natural para `src/workers`.
* **Proveedores remotos** (S3, MinIO): la interfaz (`StorageProvider`) ya está pensada para eso, pero hoy solo existe `LocalDiskStorage`.
