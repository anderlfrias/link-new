import { AppSettings, ConversationGroupSettings } from "@prisma/client";
import * as SettingsRepository from "./settings.repository";
import {
  EffectiveGroupSettings,
  GroupOverrideAllowedFlags,
  PublicAppSettingsDTO,
  UpdateSettingsInput,
} from "./settings.types";

/// Cache en memoria de proceso: `getSettings()` se llama en cada mensaje,
/// upload y operación de grupo, así que no vale la pena pegarle a la base en
/// cada una. Es por-proceso a propósito — este backend corre siempre en un
/// único proceso Node (ver server.ts), sin Redis ni otra infraestructura
/// compartida; si algún día se escala horizontalmente, este cache necesita
/// revisarse (invalidación cross-proceso).
let cached: AppSettings | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (!cached) {
    cached = await SettingsRepository.getOrCreate();
  }
  return cached;
}

export async function getPublicSettings(): Promise<PublicAppSettingsDTO> {
  const settings = await getSettings();
  return {
    maxUploadSizeMb: settings.maxUploadSizeMb,
    maxVoiceNoteDurationSeconds: settings.maxVoiceNoteDurationSeconds,
    maxGroupMembers: settings.maxGroupMembers,
    maxFilesPerMessage: settings.maxFilesPerMessage,
    allowMessageEdit: settings.allowMessageEdit,
    messageEditTimeLimitMinutes: settings.messageEditTimeLimitMinutes,
    allowMessageDeleteForEveryone: settings.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes: settings.messageDeleteForEveryoneTimeLimitMinutes,
    allowConversationDelete: settings.allowConversationDelete,
    allowGroupDelete: settings.allowGroupDelete,
    allowStickersAndGifs: settings.allowStickersAndGifs,
  };
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
  cached = await SettingsRepository.update(input);
  return cached;
}

/// Combina `AppSettings` (global, cacheado) con el override de un grupo
/// específico (o `null` si nunca fijó ninguno), campo por campo, respetando
/// los `allowGroupOverride*`: si el flag global es false para una dimensión,
/// el valor override guardado (si lo hay) se ignora — el global manda
/// siempre, incluso si el grupo ya tenía un override guardado de cuando
/// estaba permitido. Única función que debe usarse para leer estas 5
/// dimensiones en conversation.service.ts — nunca leer `AppSettings`
/// directamente para ellas.
export async function resolveEffectiveGroupSettings(
  override: ConversationGroupSettings | null,
): Promise<EffectiveGroupSettings> {
  const settings = await getSettings();
  return {
    whoCanAddMembers:
      settings.allowGroupOverrideAddMembers && override?.whoCanAddMembers != null
        ? override.whoCanAddMembers
        : settings.whoCanAddMembers,
    whoCanRemoveMembers:
      settings.allowGroupOverrideRemoveMembers && override?.whoCanRemoveMembers != null
        ? override.whoCanRemoveMembers
        : settings.whoCanRemoveMembers,
    maxGroupMembers:
      settings.allowGroupOverrideMaxGroupMembers && override?.maxGroupMembers != null
        ? override.maxGroupMembers
        : settings.maxGroupMembers,
    whoCanChangeGroupInfo:
      settings.allowGroupOverrideChangeGroupInfo && override?.whoCanChangeGroupInfo != null
        ? override.whoCanChangeGroupInfo
        : settings.whoCanChangeGroupInfo,
    whoCanDeleteGroup:
      settings.allowGroupOverrideDeleteGroup && override?.whoCanDeleteGroup != null
        ? override.whoCanDeleteGroup
        : settings.whoCanDeleteGroup,
  };
}

/// Qué dimensiones tienen actualmente permitido un override por grupo, según
/// la configuración global — usado por `getGroupSettings` para que el
/// cliente sepa qué campos puede mostrar/editar.
export async function getGroupOverrideAllowedFlags(): Promise<GroupOverrideAllowedFlags> {
  const settings = await getSettings();
  return {
    whoCanAddMembers: settings.allowGroupOverrideAddMembers,
    whoCanRemoveMembers: settings.allowGroupOverrideRemoveMembers,
    maxGroupMembers: settings.allowGroupOverrideMaxGroupMembers,
    whoCanChangeGroupInfo: settings.allowGroupOverrideChangeGroupInfo,
    whoCanDeleteGroup: settings.allowGroupOverrideDeleteGroup,
  };
}
