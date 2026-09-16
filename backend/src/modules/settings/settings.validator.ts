import { FileTypeRestrictionMode, GroupPermissionLevel } from "@prisma/client";
import * as yup from "yup";

// "type/subtype" o wildcard "type/*" (ver FILE_TYPE_CATEGORIES,
// matchesFileTypePattern en file.service.ts). Sin esta validación, guardar
// una extensión como ".pdf" en vez de "application/pdf" nunca matchea contra
// `upload.mimetype` y deja el allowlist/blocklist roto en silencio: un
// ALLOWLIST así bloquea todo, un BLOCKLIST así no bloquea nada.
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/(\*|[a-z0-9][a-z0-9.+-]*)$/i;

// Todos los campos son opcionales (PATCH parcial) — las reglas de negocio que
// dependen de otros valores (ej. bajar maxGroupMembers por debajo del tamaño
// de un grupo existente) no se validan acá, viven donde se consulta el valor.
export const updateSettingsSchema = yup
  .object({
    maxUploadSizeMb: yup.number().integer().min(1),
    fileTypeRestrictionMode: yup.string().oneOf(Object.values(FileTypeRestrictionMode)),
    fileTypeList: yup
      .array()
      .of(yup.string().required().matches(MIME_TYPE_PATTERN, "Each entry must be a mime type (e.g. \"application/pdf\" or \"audio/*\"), not a file extension")),
    maxFilesPerMessage: yup.number().integer().min(1).nullable(),
    allowConversationDelete: yup.boolean(),
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
    allowGroupDelete: yup.boolean(),
    allowGroupOverrideAddMembers: yup.boolean(),
    allowGroupOverrideRemoveMembers: yup.boolean(),
    allowGroupOverrideMaxGroupMembers: yup.boolean(),
    allowGroupOverrideChangeGroupInfo: yup.boolean(),
    allowGroupOverrideDeleteGroup: yup.boolean(),
    messageRetentionDays: yup.number().integer().min(0).nullable(),
    auditLogRetentionDays: yup.number().integer().positive().nullable(),
    allowMessageEdit: yup.boolean(),
    messageEditTimeLimitMinutes: yup.number().integer().min(1).nullable(),
    allowMessageDeleteForEveryone: yup.boolean(),
    messageDeleteForEveryoneTimeLimitMinutes: yup.number().integer().min(1).nullable(),
    allowStickersAndGifs: yup.boolean(),
    uploadCleanupEnabled: yup.boolean(),
    orphanFileRetentionHours: yup.number().integer().min(1).nullable(),
    softDeletedFilePurgeDays: yup.number().integer().min(1).nullable(),
    uploadCleanupDryRun: yup.boolean(),
    fileMigrationEnabled: yup.boolean(),
    fileMigrationBatchSize: yup.number().integer().min(1).max(500),
    fileMigrationIntervalMinutes: yup.number().integer().min(1),
    fileMigrationDeleteLocalAfterCommit: yup.boolean(),
  })
  .test(
    "at-least-one-field",
    "At least one setting is required",
    (value) =>
      value.maxUploadSizeMb !== undefined ||
      value.fileTypeRestrictionMode !== undefined ||
      value.fileTypeList !== undefined ||
      value.maxFilesPerMessage !== undefined ||
      value.allowConversationDelete !== undefined ||
      value.maxVoiceNoteDurationSeconds !== undefined ||
      value.maxGroupMembers !== undefined ||
      value.whoCanCreateGroups !== undefined ||
      value.whoCanAddMembers !== undefined ||
      value.whoCanRemoveMembers !== undefined ||
      value.whoCanChangeGroupInfo !== undefined ||
      value.whoCanDeleteGroup !== undefined ||
      value.allowGroupDelete !== undefined ||
      value.allowGroupOverrideAddMembers !== undefined ||
      value.allowGroupOverrideRemoveMembers !== undefined ||
      value.allowGroupOverrideMaxGroupMembers !== undefined ||
      value.allowGroupOverrideChangeGroupInfo !== undefined ||
      value.allowGroupOverrideDeleteGroup !== undefined ||
      value.messageRetentionDays !== undefined ||
      value.auditLogRetentionDays !== undefined ||
      value.allowMessageEdit !== undefined ||
      value.messageEditTimeLimitMinutes !== undefined ||
      value.allowMessageDeleteForEveryone !== undefined ||
      value.messageDeleteForEveryoneTimeLimitMinutes !== undefined ||
      value.allowStickersAndGifs !== undefined ||
      value.uploadCleanupEnabled !== undefined ||
      value.orphanFileRetentionHours !== undefined ||
      value.softDeletedFilePurgeDays !== undefined ||
      value.uploadCleanupDryRun !== undefined ||
      value.fileMigrationEnabled !== undefined ||
      value.fileMigrationBatchSize !== undefined ||
      value.fileMigrationIntervalMinutes !== undefined ||
      value.fileMigrationDeleteLocalAfterCommit !== undefined,
  );
