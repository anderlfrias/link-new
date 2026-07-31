import { AppSettings } from "@prisma/client";

export type UpdateSettingsInput = Partial<
  Pick<
    AppSettings,
    | "maxUploadSizeMb"
    | "fileTypeRestrictionMode"
    | "fileTypeList"
    | "maxVoiceNoteDurationSeconds"
    | "maxGroupMembers"
    | "whoCanCreateGroups"
    | "whoCanAddMembers"
    | "whoCanRemoveMembers"
    | "messageRetentionDays"
  >
>;

/// Subconjunto de `AppSettings` expuesto a cualquier usuario autenticado (no
/// solo admins): lo que un cliente necesita para validar antes de subir un
/// archivo, grabar una nota de voz o crear un grupo, sin exponer el resto de
/// la configuración administrativa.
export interface PublicAppSettingsDTO {
  maxUploadSizeMb: number;
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
}
