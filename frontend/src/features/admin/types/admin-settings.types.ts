/** Espejo de `AppSettings` (backend/prisma/schema.prisma) y de los enums
 * `GroupPermissionLevel`/`FileTypeRestrictionMode` — ver backend/src/modules/settings/README.md. */

export type FileTypeRestrictionMode = "DISABLED" | "ALLOWLIST" | "BLOCKLIST";

export type GroupPermissionLevel = "ALL_MEMBERS" | "GROUP_ADMINS_ONLY" | "APP_ADMINS_ONLY" | "CREATOR_ONLY";

export interface AdminSettings {
  maxUploadSizeMb: number;
  fileTypeRestrictionMode: FileTypeRestrictionMode;
  fileTypeList: string[];
  /** Máximo de archivos que puede llevar un solo mensaje. `null` = sin límite. */
  maxFilesPerMessage: number | null;
  /** Si un miembro puede eliminar (ocultar "para sí mismo") una conversación PRIVATE. */
  allowConversationDelete: boolean;
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
  /** Solo admite "ALL_MEMBERS" | "APP_ADMINS_ONLY" — no hay grupo ni admin de grupo antes de que el grupo exista. */
  whoCanCreateGroups: GroupPermissionLevel;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
  /** Interruptor maestro: si es false, nadie puede eliminar un grupo sin importar `whoCanDeleteGroup`. */
  allowGroupDelete: boolean;
  /** Si un grupo puede fijar su propio valor para la dimensión correspondiente. */
  allowGroupOverrideAddMembers: boolean;
  allowGroupOverrideRemoveMembers: boolean;
  allowGroupOverrideMaxGroupMembers: boolean;
  allowGroupOverrideChangeGroupInfo: boolean;
  allowGroupOverrideDeleteGroup: boolean;
  /** `null` = deshabilitado. */
  messageRetentionDays: number | null;
  /** Retención del audit trail. `null` = deshabilitado (se conserva para siempre). */
  auditLogRetentionDays: number | null;
  /** Si el propio autor puede editar el contenido de un mensaje TEXT ya enviado. */
  allowMessageEdit: boolean;
  /** Minutos desde el envío durante los que un mensaje puede editarse. `null` = sin límite. */
  messageEditTimeLimitMinutes: number | null;
  /** Si el propio autor puede borrar (para todos) un mensaje ya enviado. No afecta el borrado
   * que hace el creador de la conversación sobre mensajes ajenos (moderación). */
  allowMessageDeleteForEveryone: boolean;
  /** Minutos desde el envío durante los que un mensaje puede borrarse para todos. `null` = sin límite. */
  messageDeleteForEveryoneTimeLimitMinutes: number | null;
  /** Interruptor maestro del buscador de GIFs/stickers (Giphy). */
  allowStickersAndGifs: boolean;
  /** Interruptor maestro del worker de limpieza automática de archivos. */
  uploadCleanupEnabled: boolean;
  /** Horas tras las que un archivo sin referencias se borra. `null` = deshabilitado. */
  orphanFileRetentionHours: number | null;
  /** Días tras los que un archivo soft-deleted purga sus bytes en storage. `null` = deshabilitado. */
  softDeletedFilePurgeDays: number | null;
  /** Si es true, simula en logs sin borrar físicamente. */
  uploadCleanupDryRun: boolean;
  /** Interruptor maestro del worker de migración progresiva a S3. */
  fileMigrationEnabled: boolean;
  /** Cantidad de archivos a migrar por lote. */
  fileMigrationBatchSize: number;
  /** Intervalo en minutos entre cada ejecución del worker. */
  fileMigrationIntervalMinutes: number;
  /** Si es true, elimina el archivo local de disco tras verificar y comitear en S3. */
  fileMigrationDeleteLocalAfterCommit: boolean;
}

export type UpdateAdminSettingsPayload = Partial<AdminSettings>;
