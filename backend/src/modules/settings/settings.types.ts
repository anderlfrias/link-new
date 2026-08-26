import { AppSettings, ConversationGroupSettings, GroupPermissionLevel } from "@prisma/client";

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
    | "whoCanChangeGroupInfo"
    | "whoCanDeleteGroup"
    | "allowGroupOverrideAddMembers"
    | "allowGroupOverrideRemoveMembers"
    | "allowGroupOverrideMaxGroupMembers"
    | "allowGroupOverrideChangeGroupInfo"
    | "allowGroupOverrideDeleteGroup"
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

/// Las 5 dimensiones de gobierno de grupo que pueden tener un override por
/// grupo (ver `ConversationGroupSettings`). `whoCanCreateGroups` queda afuera
/// a propósito: no existe grupo antes de crearse, así que no tiene sentido
/// overridearlo por grupo.
export type GroupOverridableSettings = {
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  maxGroupMembers: number;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
};

/// Resultado de combinar `AppSettings` (global) con un override por-grupo,
/// respetando los `allowGroupOverride*` — ver
/// settings.service.ts#resolveEffectiveGroupSettings. Nunca contiene `null`:
/// es el valor final que `conversation.service.ts` debe usar para estas 5
/// dimensiones, en vez de leer `AppSettings` directamente.
export type EffectiveGroupSettings = GroupOverridableSettings;

export type GroupOverrideAllowedFlags = Record<keyof GroupOverridableSettings, boolean>;

export type UpdateGroupSettingsInput = Partial<
  Pick<
    ConversationGroupSettings,
    "whoCanAddMembers" | "whoCanRemoveMembers" | "maxGroupMembers" | "whoCanChangeGroupInfo" | "whoCanDeleteGroup"
  >
>;
