import { FileTypeRestrictionMode, GroupPermissionLevel } from "@prisma/client";
import * as yup from "yup";

// Todos los campos son opcionales (PATCH parcial) — las reglas de negocio que
// dependen de otros valores (ej. bajar maxGroupMembers por debajo del tamaño
// de un grupo existente) no se validan acá, viven donde se consulta el valor.
export const updateSettingsSchema = yup
  .object({
    maxUploadSizeMb: yup.number().integer().min(1),
    fileTypeRestrictionMode: yup.string().oneOf(Object.values(FileTypeRestrictionMode)),
    fileTypeList: yup.array().of(yup.string().required()),
    maxVoiceNoteDurationSeconds: yup.number().integer().min(1),
    maxGroupMembers: yup.number().integer().min(2),
    // No existe grupo ni admin de grupo antes de que el grupo exista, así que
    // APP_ADMINS_ONLY (además de ALL_MEMBERS) son los únicos valores válidos acá.
    whoCanCreateGroups: yup
      .string()
      .oneOf([GroupPermissionLevel.ALL_MEMBERS, GroupPermissionLevel.APP_ADMINS_ONLY]),
    whoCanAddMembers: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanRemoveMembers: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanChangeGroupInfo: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanDeleteGroup: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    allowGroupOverrideAddMembers: yup.boolean(),
    allowGroupOverrideRemoveMembers: yup.boolean(),
    allowGroupOverrideMaxGroupMembers: yup.boolean(),
    allowGroupOverrideChangeGroupInfo: yup.boolean(),
    allowGroupOverrideDeleteGroup: yup.boolean(),
    messageRetentionDays: yup.number().integer().min(0).nullable(),
    allowMessageEdit: yup.boolean(),
    messageEditTimeLimitMinutes: yup.number().integer().min(1).nullable(),
    allowMessageDeleteForEveryone: yup.boolean(),
    messageDeleteForEveryoneTimeLimitMinutes: yup.number().integer().min(1).nullable(),
  })
  .test(
    "at-least-one-field",
    "At least one setting is required",
    (value) =>
      value.maxUploadSizeMb !== undefined ||
      value.fileTypeRestrictionMode !== undefined ||
      value.fileTypeList !== undefined ||
      value.maxVoiceNoteDurationSeconds !== undefined ||
      value.maxGroupMembers !== undefined ||
      value.whoCanCreateGroups !== undefined ||
      value.whoCanAddMembers !== undefined ||
      value.whoCanRemoveMembers !== undefined ||
      value.whoCanChangeGroupInfo !== undefined ||
      value.whoCanDeleteGroup !== undefined ||
      value.allowGroupOverrideAddMembers !== undefined ||
      value.allowGroupOverrideRemoveMembers !== undefined ||
      value.allowGroupOverrideMaxGroupMembers !== undefined ||
      value.allowGroupOverrideChangeGroupInfo !== undefined ||
      value.allowGroupOverrideDeleteGroup !== undefined ||
      value.messageRetentionDays !== undefined ||
      value.allowMessageEdit !== undefined ||
      value.messageEditTimeLimitMinutes !== undefined ||
      value.allowMessageDeleteForEveryone !== undefined ||
      value.messageDeleteForEveryoneTimeLimitMinutes !== undefined,
  );
