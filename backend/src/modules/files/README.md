# Files

Sube, sirve metadata de, y borra `StoredFile` (`prisma/schema.prisma`) — el único modelo de archivo de todo el sistema (ver [backend/README.md, "Gestión de Archivos"](../../../README.md#gestión-de-archivos)). Un `StoredFile` no pertenece a ninguna conversación ni mensaje en particular: por eso este módulo es un recurso plano (`/api/v1/files`, no anidado bajo `conversations`), y `conversations` (`imageFileId`) y `messages` (`fileIds`) simplemente referencian por `id` los archivos que ya subiste acá.

Este módulo no decide **cómo ni dónde** se guarda físicamente un archivo — eso es trabajo de [`src/storage`](../../storage) (`StorageProvider`). Este módulo decide **qué es un archivo válido** (tipo, tamaño, quién lo subió) y mantiene la fila de `StoredFile`.

## Endpoints

Base: `/api/v1/files`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Sube un archivo (`multipart/form-data`, campo `file`, `conversationId` y `kind` opcionales). |
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

`kind` es opcional (`"file"` default, o `"voice_note"`) — distingue una nota de voz grabada de un adjunto genérico, ya que solo la primera tiene un límite de duración. No se persiste: el archivo se guarda igual sea cual sea el `kind`.

Validaciones, en este orden:
1. **Techo de seguridad fijo** (`ABSOLUTE_MAX_UPLOAD_BYTES`, `file.route.ts`, 500 MB, no editable) — lo hace `multer` directamente; si se excede, lanza un `MulterError` que el error handler global (`middlewares/error.middleware.ts`) traduce a `400` (no es un `AppError`, por eso necesita ese caso especial). Existe solo para no dejar que `multer` bufferee en memoria un body absurdamente grande.
2. **Membresía**, solo si mandaste `conversationId`: `403` si no sos miembro de esa conversación. Sin este chequeo, cualquiera podría namespacear archivos bajo una conversación ajena.
3. **Tamaño real** (`file.service.ts`, `uploadFile`) contra `AppSettings.maxUploadSizeMb` — este es el límite editable en runtime por un admin (ver [`settings`](../settings/README.md)); `400` si se excede.
4. **Tipo de archivo**, solo si `AppSettings.fileTypeRestrictionMode` no es `DISABLED` (default): `ALLOWLIST` rechaza (`400`) cualquier mime type que no esté en `fileTypeList`; `BLOCKLIST` rechaza el que sí esté.
5. **Duración**, solo si `kind === "voice_note"`: exige mime type `audio/*` y calcula la duración real del buffer (`music-metadata`, nunca confiando en un valor que mande el cliente) contra `AppSettings.maxVoiceNoteDurationSeconds`; `400` si se excede.

**Sin allowlist de tipo MIME por defecto**: un adjunto de mensaje acepta cualquier tipo de archivo (csv, exe, lo que sea) salvo que un admin active un allowlist/blocklist — a diferencia del avatar/foto de grupo (`auth.route.ts`), que siempre exige `image/*` contra [`ALLOWED_MIME_TYPES`](../../constants/allowed-file-types.constant.ts). Ese mismo mapa sigue existiendo también como respaldo de extensión en `safeExtension()` (ver más abajo) y como gate del avatar.

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

## Avatar de usuario (`User.avatarFileId`)

Llega acá por dos caminos, mutuamente excluyentes por usuario:

1. **Sincronizada desde el proveedor externo** (EXTERNAL_AUTH hoy) — mientras `User.syncProfileWithIntegration` siga en `true` (default). Históricamente EXTERNAL_AUTH solo servía `GET /v1/profile/picture` identificando por token (nunca por id/username de un tercero), así que la única forma de tener la foto de "otro usuario" era que ese usuario cacheara la suya propia al iniciar sesión (`auth.service.ts`, `syncProfilePicture`, fire-and-forget desde `auth.controller.ts`). EXTERNAL_AUTH ahora también expone `GET /v1/profile/picture/:username` (de un tercero, por username) — `syncContactAvatar` en `auth.service.ts` la usa para cachear la foto de contactos que **todavía no iniciaron sesión acá**, como parte de `syncAppUsers` (ver `modules/auth/README.md` y `modules/users/user.service.ts`). Ambos comparan el checksum de lo que devuelve el proveedor contra el del `StoredFile` ya guardado (`getFileChecksum`) antes de guardar uno nuevo, y ambos respetan el flag: si ya está en `false` para ese usuario, ninguno de los dos ni siquiera intenta traer una foto nueva.
2. **Subida localmente** — `PUT /api/v1/auth/profile/picture` (`setProfilePicture` en auth.service.ts), la primera vez que el usuario elige su propia foto acá. Esto apaga `syncProfileWithIntegration` para ese usuario: a partir de ahí, el camino 1 deja de tocar su avatar en cualquier login o sync de contactos futuro (ver `modules/auth/README.md`, "Desacoplar el perfil del proveedor externo").

Sea cual sea el camino, el resultado se guarda igual: un `StoredFile` normal vía `file.service.ts` (`storeAvatar`), bajo `avatars/<userId>/...`, apuntado por `User.avatarFileId`. A partir de ahí, cualquier otro usuario la ve — se sirve como cualquier otro `StoredFile`, sin pasar por ningún proveedor externo.

## Qué falta a propósito

* **Limpieza de archivos huérfanos**: un `StoredFile` borrado lógicamente, o reemplazado por una foto de perfil nueva, no se borra físicamente. Candidato natural para `src/workers`.
* **Proveedores remotos** (S3, MinIO): la interfaz (`StorageProvider`) ya está pensada para eso, pero hoy solo existe `LocalDiskStorage`.
