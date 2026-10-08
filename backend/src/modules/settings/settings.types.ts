import { AppSettings, ConversationGroupSettings, GroupPermissionLevel } from "@prisma/client";

export type UpdateSettingsInput = Partial<
  Pick<
    AppSettings,
    | "maxUploadSizeMb"
    | "fileTypeRestrictionMode"
    | "fileTypeList"
    | "maxFilesPerMessage"
    | "allowConversationDelete"
    | "maxVoiceNoteDurationSeconds"
    | "maxGroupMembers"
    | "whoCanCreateGroups"
    | "whoCanAddMembers"
    | "whoCanRemoveMembers"
    | "whoCanChangeGroupInfo"
    | "whoCanDeleteGroup"
    | "allowGroupDelete"
    | "whoCanLeaveGroup"
    | "allowGroupOverrideAddMembers"
    | "allowGroupOverrideRemoveMembers"
    | "allowGroupOverrideMaxGroupMembers"
    | "allowGroupOverrideChangeGroupInfo"
    | "allowGroupOverrideDeleteGroup"
    | "allowGroupOverrideLeaveGroup"
    | "messageRetentionDays"
    | "auditLogRetentionDays"
    | "allowMessageEdit"
    | "messageEditTimeLimitMinutes"
    | "allowMessageDeleteForEveryone"
    | "messageDeleteForEveryoneTimeLimitMinutes"
    | "allowStickersAndGifs"
    | "uploadCleanupEnabled"
    | "orphanFileRetentionHours"
    | "softDeletedFilePurgeDays"
    | "uploadCleanupDryRun"
    | "fileMigrationEnabled"
    | "fileMigrationBatchSize"
    | "fileMigrationIntervalMinutes"
    | "fileMigrationDeleteLocalAfterCommit"
    | "localSessionTtlHours"
    | "passwordMinLength"
    | "passwordRequireUppercase"
    | "passwordRequireLowercase"
    | "passwordRequireNumber"
    | "passwordRequireSymbol"
    | "passwordExpirationDays"
    | "passwordHistoryCount"
    | "maxFailedLoginAttempts"
    | "lockoutDurationMinutes"
  >
>;

/// Sesión y política de contraseñas del modo local, ya con los pisos y
/// topes aplicados (LOCAL_AUTH_PLAN.md, D15). La lee el login local, el cambio
/// de contraseña y `GET /auth/config`.
export interface LocalAuthPolicy {
  sessionTtlHours: number;
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  /// null = las contraseñas no vencen.
  expirationDays: number | null;
  /// Cuántas contraseñas recientes no se pueden repetir, contando la actual.
  historyCount: number;
  /// null = sin bloqueo por cuenta.
  maxFailedLoginAttempts: number | null;
  lockoutDurationMinutes: number;
}

/// Subconjunto de `AppSettings` expuesto a cualquier usuario autenticado (no
/// solo admins): lo que un cliente necesita para validar antes de subir un
/// archivo, grabar una nota de voz o crear un grupo, sin exponer el resto de
/// la configuración administrativa.
export interface PublicAppSettingsDTO {
  /// Máximo **efectivo** de un archivo: lo configurado por el admin
  /// (`AppSettings.maxUploadSizeMb`) con almacenamiento S3, y como mucho
  /// `DIRECT_UPLOAD_MAX_MB` (32) sin S3, donde no hay subida por partes. Es lo
  /// que el cliente usa para validar antes de subir.
  maxUploadSizeMb: number;
  /// `true` si la subida por partes (`/v1/uploads`) está disponible, es decir,
  /// con `STORAGE_WRITE_PROVIDER=S3`. Sin eso, todo archivo va por el camino
  /// directo (`POST /v1/files`).
  chunkedUploads: boolean;
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
  /// null = sin límite. Expuesto para que el compositor de mensajes pueda
  /// frenar la selección ANTES de subir de más — la autoridad real sigue
  /// siendo message.service.ts (sendMessage), que rechaza el POST si igual
  /// llegan más `fileIds` que este límite.
  maxFilesPerMessage: number | null;
  /// Expuestos a cualquier autenticado (no solo admin) porque el cliente los
  /// necesita para mostrar/ocultar las acciones de editar/borrar sobre sus
  /// propios mensajes — ver message.service.ts (editMessage/deleteMessage),
  /// que es quien realmente hace cumplir estas reglas.
  allowMessageEdit: boolean;
  messageEditTimeLimitMinutes: number | null;
  allowMessageDeleteForEveryone: boolean;
  messageDeleteForEveryoneTimeLimitMinutes: number | null;
  /// Idem — el cliente los necesita para mostrar/ocultar "Eliminar chat"
  /// (PRIVATE) y "Eliminar grupo" (GROUP) sin depender de un fetch de
  /// settings de grupo; la autoridad real sigue siendo
  /// conversation.service.ts#deleteConversation.
  allowConversationDelete: boolean;
  allowGroupDelete: boolean;
  /// El composer lo necesita para mostrar/ocultar el botón de GIFs/stickers
  /// sin depender de un fetch aparte; la autoridad real sigue siendo
  /// giphy.service.ts, que rechaza /v1/giphy/* con 403 si está en false.
  allowStickersAndGifs: boolean;
}

/// Las 6 dimensiones de gobierno de grupo que pueden tener un override por
/// grupo (ver `ConversationGroupSettings`). `whoCanCreateGroups` queda afuera
/// a propósito: no existe grupo antes de crearse, así que no tiene sentido
/// overridearlo por grupo.
export type GroupOverridableSettings = {
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  maxGroupMembers: number;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
  whoCanLeaveGroup: GroupPermissionLevel;
};

/// Resultado de combinar `AppSettings` (global) con un override por-grupo,
/// respetando los `allowGroupOverride*` — ver
/// settings.service.ts#resolveEffectiveGroupSettings. Nunca contiene `null`:
/// es el valor final que `conversation.service.ts` debe usar para estas 6
/// dimensiones, en vez de leer `AppSettings` directamente.
export type EffectiveGroupSettings = GroupOverridableSettings;

export type GroupOverrideAllowedFlags = Record<keyof GroupOverridableSettings, boolean>;

export type UpdateGroupSettingsInput = Partial<
  Pick<
    ConversationGroupSettings,
    | "whoCanAddMembers"
    | "whoCanRemoveMembers"
    | "maxGroupMembers"
    | "whoCanChangeGroupInfo"
    | "whoCanDeleteGroup"
    | "whoCanLeaveGroup"
  >
>;
