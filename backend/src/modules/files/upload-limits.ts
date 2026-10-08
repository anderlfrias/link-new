/// Techo del camino directo de subida (`POST /v1/files`): multer bufferea el
/// archivo entero en memoria, así que un tope fijo evita que una sola subida
/// grande (o varias a la vez) agote la memoria del proceso y lo reinicie (por
/// ejemplo con `max_memory_restart` de PM2, ver ecosystem.config.js). No lo edita
/// un admin.
///
/// Sin almacenamiento S3 es el máximo real de un archivo: la subida por partes
/// (`/v1/uploads`) solo existe con S3. Con S3, los archivos más grandes van por
/// partes y el máximo es `AppSettings.maxUploadSizeMb`. Ver `getPublicSettings`
/// (settings.service.ts), que se lo informa al cliente.
export const DIRECT_UPLOAD_MAX_MB = 32;
export const DIRECT_UPLOAD_MAX_BYTES = DIRECT_UPLOAD_MAX_MB * 1024 * 1024;
