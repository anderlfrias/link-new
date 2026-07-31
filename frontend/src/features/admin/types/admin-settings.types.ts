/** Espejo de `AppSettings` (backend/prisma/schema.prisma) y de los enums
 * `GroupPermissionLevel`/`FileTypeRestrictionMode` — ver backend/src/modules/settings/README.md. */

export type FileTypeRestrictionMode = "DISABLED" | "ALLOWLIST" | "BLOCKLIST";

export type GroupPermissionLevel = "ALL_MEMBERS" | "ADMINS_ONLY" | "CREATOR_ONLY";

export interface AdminSettings {
  maxUploadSizeMb: number;
  fileTypeRestrictionMode: FileTypeRestrictionMode;
  fileTypeList: string[];
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
  /** Solo admite "ALL_MEMBERS" | "ADMINS_ONLY" — no hay "creador" antes de que el grupo exista. */
  whoCanCreateGroups: GroupPermissionLevel;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  /** `null` = deshabilitado. */
  messageRetentionDays: number | null;
}

export type UpdateAdminSettingsPayload = Partial<AdminSettings>;
