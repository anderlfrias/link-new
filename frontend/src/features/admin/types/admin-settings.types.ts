/** Espejo de `AppSettings` (backend/prisma/schema.prisma) y de los enums
 * `GroupPermissionLevel`/`FileTypeRestrictionMode` — ver backend/src/modules/settings/README.md. */

export type FileTypeRestrictionMode = "DISABLED" | "ALLOWLIST" | "BLOCKLIST";

export type GroupPermissionLevel = "ALL_MEMBERS" | "GROUP_ADMINS_ONLY" | "APP_ADMINS_ONLY" | "CREATOR_ONLY";

export interface AdminSettings {
  maxUploadSizeMb: number;
  fileTypeRestrictionMode: FileTypeRestrictionMode;
  fileTypeList: string[];
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
  /** Solo admite "ALL_MEMBERS" | "APP_ADMINS_ONLY" — no hay grupo ni admin de grupo antes de que el grupo exista. */
  whoCanCreateGroups: GroupPermissionLevel;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
  /** Si un grupo puede fijar su propio valor para la dimensión correspondiente. */
  allowGroupOverrideAddMembers: boolean;
  allowGroupOverrideRemoveMembers: boolean;
  allowGroupOverrideMaxGroupMembers: boolean;
  allowGroupOverrideChangeGroupInfo: boolean;
  allowGroupOverrideDeleteGroup: boolean;
  /** `null` = deshabilitado. */
  messageRetentionDays: number | null;
}

export type UpdateAdminSettingsPayload = Partial<AdminSettings>;
