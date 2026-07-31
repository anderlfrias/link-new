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
    // No existe un "creador" antes de que el grupo exista, así que ADMINS_ONLY
    // (además de ALL_MEMBERS) son los únicos valores válidos acá.
    whoCanCreateGroups: yup
      .string()
      .oneOf([GroupPermissionLevel.ALL_MEMBERS, GroupPermissionLevel.ADMINS_ONLY]),
    whoCanAddMembers: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanRemoveMembers: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    messageRetentionDays: yup.number().integer().min(0).nullable(),
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
      value.messageRetentionDays !== undefined,
  );
