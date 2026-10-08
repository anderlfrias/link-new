# Files

Sube, sirve metadata de, y borra `StoredFile` (`prisma/schema.prisma`) — el único modelo de archivo de todo el sistema (ver [backend/README.md, "Gestión de Archivos"](../../../README.md#gestión-de-archivos)). Un `StoredFile` no pertenece a ninguna conversación ni mensaje en particular: por eso este módulo es un recurso plano (`/api/v1/files`, no anidado bajo `conversations`), y `conversations` (`imageFileId`) y `messages` (`fileIds`) simplemente referencian por `id` los archivos que ya subiste acá.

Este módulo no decide **cómo ni dónde** se guarda físicamente un archivo — eso es trabajo de [`src/storage`](../../storage) (`StorageProvider`). Este módulo decide **qué es un archivo válido** (tipo, tamaño, quién lo subió) y mantiene la fila de `StoredFile`.

## Endpoints

Base: `/api/v1/files`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Sube un archivo directo, hasta 32 MB (`multipart/form-data`, campo `file`, `conversationId` y `kind` opcionales). |
| `GET` | `/:id` | Metadata del archivo (incluye `url` firmada de descarga). |
| `GET` | `/:id/content` | Descarga o streaming del archivo (`?t=...` token HMAC o `Authorization: Bearer`). |
| `DELETE` | `/:id` | Borrado lógico (solo quien lo subió). |

Todas requieren autenticación (`authenticate` + `attachInternalUser`), salvo `GET /:id/content` cuando incluye un token HMAC firmado válido en el query parameter `?t=...`.

### `POST /` — Subir (Directo ≤ 16 MiB)

Con almacenamiento S3, los archivos mayores a 16 MiB (hasta `maxUploadSizeMb`, por defecto 2 GB) se suben con el módulo chunked/multipart [`/api/v1/uploads`](../uploads/README.md). **Sin S3 no hay subida por partes**: este endpoint es el único camino y su techo, 32 MB (`DIRECT_UPLOAD_MAX_BYTES`, `upload-limits.ts`), es el máximo real de un archivo, aunque `maxUploadSizeMb` sea mayor. `GET /api/v1/settings/public` informa el límite efectivo y `chunkedUploads` para que el cliente elija el camino.

```bash
curl -X POST http://localhost:4000/api/v1/files \
  -H "Authorization: Bearer <token>" \
  -F "file=@/ruta/local/foto.jpg" \
  -F "conversationId=<uuid-de-la-conversación>"
```

`conversationId` es opcional y **solo afecta dónde se guarda el archivo en disco** (ver más abajo) — no crea ninguna relación en la base; la única relación real la crea después `messages` (`fileIds`) o `conversations` (`imageFileId`) al referenciar este `id`.

`kind` es opcional (`"file"` default, o `"voice_note"`) — distingue una nota de voz grabada de un adjunto genérico, ya que solo la primera tiene un límite de duración. No se persiste: el archivo se guarda igual sea cual sea el `kind`.

Validaciones, en este orden:
1. **Techo de seguridad fijo** (`DIRECT_UPLOAD_MAX_BYTES`, `upload-limits.ts`, 32 MB, no editable) — lo hace `multer` directamente; si se excede, lanza un `MulterError` que el error handler global (`middlewares/error.middleware.ts`) traduce a `400` (no es un `AppError`, por eso necesita ese caso especial). Existe solo para no dejar que `multer` bufferee en memoria un body absurdamente grande.
2. **Membresía**, solo si mandaste `conversationId`: `403` si no sos miembro de esa conversación. Sin este chequeo, cualquiera podría namespacear archivos bajo una conversación ajena.
3. **Tamaño real** (`file.service.ts`, `uploadFile`) contra `AppSettings.maxUploadSizeMb` — este es el límite editable en runtime por un admin (ver [`settings`](../settings/README.md)); `400` si se excede.
4. **Tipo de archivo**, solo si `AppSettings.fileTypeRestrictionMode` no es `DISABLED` (default): `ALLOWLIST` rechaza (`400`) cualquier mime type que no matchee ninguna entrada de `fileTypeList`; `BLOCKLIST` rechaza el que sí matchee. Cada entrada guardada es siempre un mime type exacto (`"application/pdf"`) o un wildcard de tipo (`"audio/*"`, `"video/*"`) — ver `matchesFileTypePattern()`; el backend nunca ve ni valida una extensión, solo mime types. El panel de admin arma `fileTypeList` con un multiselect autocompletado (`FileTypeMultiSelect.tsx`): eligiendo categorías curadas (`FILE_TYPE_CATEGORIES`, `src/constants/file-type-categories.constant.ts` — incluye "Ejecutables") que expanden a uno o más mime types, o tipeando un valor manual — si lo tipeado es una extensión conocida (`".pdf"`, `".exe"`, etc.), se resuelve **en el cliente** al mime type real antes de agregarse (`FILE_TYPE_EXTENSION_ALIASES`, `frontend/src/features/admin/constants/file-type-extension-aliases.constant.ts`); si es un mime type completo, se valida con el mismo patrón `tipo/subtipo` (o `tipo/*`) que usa `settings.validator.ts` en el servidor (`utils/mime-type-pattern.ts`, frontend), para que el error aparezca al tipear en vez de recién al guardar. Un botón "?" al lado del campo explica el formato. `settings.validator.ts` sigue siendo la autoridad real: rechaza en el `PATCH` cualquier entrada que no tenga forma de mime type, sin importar qué haya podido colarse desde el cliente. **Además del tipo que declara el cliente, se mira el contenido real:** los primeros bytes del archivo (`detectMimeFromSignature`, `file-signature.ts`: ejecutables, ZIP y derivados, PDF, imágenes, audio, video y comprimidos más comunes) revelan su tipo, y `assertFileTypeAllowed` lo aplica junto con el declarado. Si coinciden (o son del mismo contenedor: un `.docx` es un ZIP, `audio/webm` es WebM), vale el declarado, como siempre; si no, el archivo miente sobre su tipo: con `ALLOWLIST` tienen que estar permitidos los dos, y con `BLOCKLIST` alcanza con que uno esté bloqueado (un `.exe` declarado como `application/pdf` no pasa una blocklist de ejecutables). No cambia el `mimeType` que se guarda. **Límite:** los formatos de texto (CSV, TXT, JSON, scripts `.bat`/`.ps1`/`.sh`) no tienen firma, así que para ellos la restricción sigue siendo sobre el tipo declarado; igual que cualquier formato que la tabla no reconozca.
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
  "url": "/api/v1/files/9f2b3c1a-..../content?t=eyJhbGciOi...",
  "createdAt": "2026-07-23T20:00:00.000Z"
}
```

> [!NOTE]
> **Serialización de `size`**: En la base de datos PostgreSQL, `StoredFile.size` se almacena como `BigInt` (para admitir archivos grandes hasta terabytes sin desborde de entero de 32 bits). En los endpoints HTTP, se serializa a `number` para interoperabilidad directa con clientes JavaScript/JSON.

`url` la construye el `StorageProvider` activo a partir de la ruta y un token HMAC firmado (`?t=...`, TTL 1 hora) — nunca se expone `path` ni `storedName` (rutas físicas) directamente en la respuesta.

### Organización en disco (`buildStorageDir()` en `file.service.ts`)

Para no acumular todos los archivos sueltos en una única carpeta plana, cada subida se namespacea por conversación y por año/mes de subida:

* Con `conversationId`: `chat/<conversationId>/<yyyy>/<mm>/<uuid>.<ext>`.
* Sin `conversationId` (subida sin destino conocido todavía, ej. futuro avatar de usuario): `chat/<yyyy>/<mm>/<uuid>.<ext>`.

El nombre físico (`storedName`) sigue siendo siempre un UUID — la carpeta agrupa, pero no reemplaza la garantía de "nombre no adivinable" (ver más abajo).

### `GET /:id`

Devuelve la metadata del archivo en el mismo formato que `POST /`. Verifica permisos de acceso mediante `canAccessFile` (debe ser el uploader, miembro de una conversación donde se use el archivo, o admin). "Se usa en una conversación" cuenta solo si el mensaje que lo adjunta no está borrado y la conversación (o el grupo cuya imagen es) no fue eliminada: después de "borrar para todos", solo quien subió el archivo (y un admin) lo sigue descargando.

**Quién puede adjuntar qué.** Como el acceso a un archivo se deriva de dónde está adjunto, adjuntarlo a un mensaje es una concesión de acceso y se restringe: el remitente solo puede adjuntar archivos que subió él, o que ya ve como adjunto de un mensaje vigente en una conversación vigente de la que es miembro (el caso del sticker favorito recibido de otra persona). Nunca avatares ni imágenes de grupo. Lo mismo vale para la imagen de un grupo, que tiene que ser una imagen subida por quien la asigna. Cualquier otro id responde el mismo `400` que un id inexistente. La regla vive en `countFilesAttachableBy`/`findOwnedActiveFile` (`file.repository.ts`).

### `GET /:id/content`

Descarga o transmisión segura del archivo.
* **Autenticación dual**: Acepta `Authorization: Bearer <token>` o token firmado en query string `?t=<hmac_token>` (permitiendo que elementos HTML como `<img src="...">` o descargas directas del navegador funcionen sin cabeceras personalizadas).
* **Control de acceso**: Valida que el token HMAC sea legítimo y no haya expirado, o que el usuario autenticado tenga permiso (`canAccessFile`).
* **Protección contra XSS**: Envía cabeceras estrictas `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` y `Content-Disposition: inline` únicamente para imágenes y audios seguros; todo lo demás (incluyendo HTML y SVG) se descarga forzosamente como `Content-Disposition: attachment; filename*=UTF-8''...`.
* **Redirección S3**: Si el archivo reside en `FileProvider.S3`, responde con `302 Found` hacia una URL presignada GET del storage con TTL corto (5 minutos). Si reside en `FileProvider.LOCAL`, hace streaming mediante `res.sendFile()`.
* **Rate limit**: Protegido por `downloadRateLimiter` (180 descargas por usuario/IP cada 15 minutos).

### `DELETE /:id`

Borrado lógico (`deletedAt`) — igual que `Conversation`/`Message` en el resto del sistema. Solo quien subió el archivo (`403` para cualquier otro). **No borra el archivo físico ni verifica si sigue referenciado** (por un mensaje, una conversación o un usuario). Limpiar archivos huérfanos o abandonados es tarea de procesos en segundo plano.

## Gestión de storage (admin)

```
adminFileRouter.use(authenticate, attachInternalUser, requireRoles("admin"))
```

Base: `/api/v1/admin/files`, requiere rol `"admin"` (ver [`../auth/README.md`](../auth/README.md)). A diferencia de todo lo demás en este módulo, **lista y borra CUALQUIER `StoredFile`** sin importar quién lo subió ni para qué se usa (avatar, foto de grupo, adjunto de mensaje) — es la vista de "cuánto espacio ocupa la instalación", no una vista personal.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Lista archivos activos, paginado y filtrable. |
| `DELETE` | `/:id` | Borra un archivo **físicamente**, además de marcarlo `deletedAt`. |

### `GET /` — Listar

Query params, todos opcionales: `before` (cursor, id del último archivo de la página anterior), `limit` (default 50, máx 100), `type` (`"image"` \| `"audio"` \| `"other"`, por prefijo de `mimeType`), `uploader` (busca en `createdBy.name`/`createdBy.email`, contains case-insensitive), `search` (busca en `originalName`), `from`/`to` (rango de `createdAt`, ISO date).

Respuesta `200`:
```json
{
  "files": [
    {
      "id": "<uuid>", "originalName": "foto.jpg", "mimeType": "image/jpeg", "extension": "jpg",
      "size": 245678, "url": "/uploads/...", "createdAt": "...",
      "createdBy": { "id": "<uuid>", "name": "Ana", "email": "ana@x.com" },
      "usage": { "avatarOfUserCount": 0, "groupImageOfConversationCount": 0, "messageAttachmentCount": 3 }
    }
  ],
  "totalCount": 214,
  "totalSize": 583200123
}
```
`totalCount`/`totalSize` son agregados sobre **todos** los archivos que matchean el filtro (no solo la página actual, `prisma.storedFile.aggregate`) — para mostrar un resumen de espacio usado sin tener que traer todas las páginas. `usage` cuenta las relaciones inversas que `StoredFile` ya tenía (`avatarOfUsers`, `imageOfConversations`, `messageFiles`) vía `_count`, sin N+1. Todo en cero = archivo huérfano (no lo usa nada), candidato obvio a borrar.

### `DELETE /:id` — Borrar físicamente

**Distinto del `DELETE /:id` de arriba**: este SÍ borra el archivo del disco (`storage.delete(file.path)`, ver [`../../storage`](../../storage)) — libera espacio real, es la razón de ser de esta vista. Sin embargo, la fila de `StoredFile` **nunca se borra**, solo se marca `deletedAt` (igual que el borrado lógico normal): así cualquier referencia existente (`User.avatarFileId`, `Conversation.imageFileId`, `MessageFile`) sigue apuntando a una fila con nombre/tamaño válidos, para poder mostrar un placeholder de "archivo eliminado" donde corresponda (ver [`../messages/README.md`](../messages/README.md)) en vez de romperse. Sin chequeo de ownership — el único gate es el rol admin. Si el borrado físico falla (IO real, no "ya no existe" — `LocalDiskStorage.delete` usa `force: true`), se loguea pero no bloquea el `deletedAt`: un archivo físico ya ausente no debe impedir marcarlo eliminado en la base.

## Por qué la extensión nunca sale del nombre original tal cual

`safeExtension()` (`file.service.ts`) intenta usar la extensión del nombre original **solo si** es alfanumérica simple (`^[a-z0-9]{1,10}$`); si no, cae al mapeo por tipo MIME en `ALLOWED_MIME_TYPES`, y si tampoco hay match, a `"bin"`. El nombre físico (`storedName`) siempre es un UUID generado acá, nunca el nombre que mandó el cliente — por eso no hay riesgo de path traversal ni de colisión, sin necesidad de sanitizar rutas en `src/storage`.

## Avatar de usuario (`User.avatarFileId`)

Llega acá por dos caminos, mutuamente excluyentes por usuario:

1. **Sincronizada desde el proveedor externo** (EXTERNAL_AUTH hoy) — mientras `User.syncProfileWithIntegration` siga en `true` (default). Históricamente EXTERNAL_AUTH solo servía `GET /v1/profile/picture` identificando por token (nunca por id/username de un tercero), así que la única forma de tener la foto de "otro usuario" era que ese usuario cacheara la suya propia al iniciar sesión (el `onLogin` del proveedor, en segundo plano). EXTERNAL_AUTH ahora también expone `GET /v1/profile/picture/:username` (de un tercero, por username) — el `onLogin` del proveedor la usa para cachear la foto de contactos que **todavía no iniciaron sesión acá**, al sincronizar el directorio (ver `modules/auth/README.md`). Los dos caminos terminan en `setAvatarFromProvider` (`auth.service.ts`), que compara el checksum de lo que devuelve el proveedor contra el del `StoredFile` ya guardado (`getFileChecksum`) antes de guardar uno nuevo, y respeta el flag: si ya está en `false` para ese usuario, no guarda nada (y la foto propia ni siquiera se pide).
2. **Subida localmente** — `PUT /api/v1/auth/profile/picture` (`setProfilePicture` en auth.service.ts), la primera vez que el usuario elige su propia foto acá. Esto apaga `syncProfileWithIntegration` para ese usuario: a partir de ahí, el camino 1 deja de tocar su avatar en cualquier login o sync de contactos futuro (ver `modules/auth/README.md`, "Desacoplar el perfil del proveedor externo").

Sea cual sea el camino, el resultado se guarda igual: un `StoredFile` normal vía `file.service.ts` (`storeAvatar`), bajo `avatars/<userId>/...`, apuntado por `User.avatarFileId`. A partir de ahí, cualquier otro usuario la ve — se sirve como cualquier otro `StoredFile`, sin pasar por ningún proveedor externo.

## Arquitectura y Módulos Relacionados

* **Almacenamiento S3**: Soportado en [`src/storage/s3.storage.ts`](../../storage/s3.storage.ts) mediante cliente `@aws-sdk/client-s3` con soporte para SeaweedFS, streaming y URLs presignadas.
* **Subida de Archivos Grandes (> 16 MiB)**: Implementada en el módulo [`src/modules/uploads`](../uploads/README.md) mediante subida multipart directa a S3 en fragmentos de 8 MiB con verificación de integridad `HeadObject`.
* **Limpieza y Ciclo de Vida**: Gestionada en segundo plano por `src/workers/upload-cleanup.worker.ts` (cancela sesiones multipart expiradas en S3).
* **Migración en Caliente**: Gestionada en segundo plano por `src/workers/file-migration.worker.ts` (migra gradualmente archivos de `LOCAL` a `S3` con verificación estricta de orden y checksum).
