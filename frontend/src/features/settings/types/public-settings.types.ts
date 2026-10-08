/** Espejo de `PublicAppSettingsDTO` (backend/src/modules/settings/settings.types.ts)
 * — ver backend/API.md, sección 12.2. Subconjunto de solo lectura de `AppSettings`
 * expuesto a cualquier autenticado, no solo admins. */
export interface PublicAppSettings {
  /** Máximo **efectivo** de un archivo: lo configurado por el admin con almacenamiento S3, y como
   * mucho 32 MB sin S3 (donde no hay subida por partes). Es el que se muestra y el que se valida. */
  maxUploadSizeMb: number;
  /** `true` si la subida por partes (`/v1/uploads`) está disponible (almacenamiento S3). Sin eso,
   * todo archivo va por el camino directo, `POST /v1/files`. */
  chunkedUploads: boolean;
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
  /** Máximo de archivos que puede llevar un solo mensaje. `null` = sin límite. */
  maxFilesPerMessage: number | null;
  allowMessageEdit: boolean;
  messageEditTimeLimitMinutes: number | null;
  allowMessageDeleteForEveryone: boolean;
  messageDeleteForEveryoneTimeLimitMinutes: number | null;
  /** Si un miembro puede eliminar (ocultar "para sí mismo") una conversación PRIVATE. */
  allowConversationDelete: boolean;
  /** Interruptor maestro: si es false, nadie puede eliminar un grupo sin importar `whoCanDeleteGroup`. */
  allowGroupDelete: boolean;
  /** Muestra/oculta el botón de GIFs/stickers en el composer — la autoridad
   * real sigue siendo el backend (/v1/giphy/*, 403 si está en false). */
  allowStickersAndGifs: boolean;
}
