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
}

export type UpdateAdminSettingsPayload = Partial<AdminSettings>;
