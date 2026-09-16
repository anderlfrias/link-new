import { AppSettings, AuditAction, ConversationGroupSettings } from "@prisma/client";
import { prisma } from "../../config/prisma";
import * as AuditRepository from "../audit/audit.repository";
import * as AuditService from "../audit/audit.service";
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

export function _resetCacheForTesting(): void {
  cached = null;
}

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

export function diffSettings(
  before: AppSettings,
  input: UpdateSettingsInput,
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(input) as Array<keyof UpdateSettingsInput>) {
    const fromVal = before[key as keyof AppSettings];
    const toVal = input[key];
    if (toVal !== undefined) {
      if (Array.isArray(fromVal) && Array.isArray(toVal)) {
        if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
          changed[key] = { from: fromVal, to: toVal };
        }
      } else if (toVal !== fromVal) {
        changed[key] = { from: fromVal, to: toVal };
      }
    }
  }
  return changed;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
  const before = await getSettings();
  const changed = diffSettings(before, input);

  // Una PATCH que no cambia nada no genera rastro: una fila de auditoría vacía
  // solo agrega ruido a la revisión.
  if (Object.keys(changed).length === 0) {
    return before;
  }

  // Efecto y rastro en la misma transacción: que la configuración global de la
  // instalación pueda cambiar sin dejar constancia de quién la cambió es el
  // agujero que esta fase cierra (LOGGING_PLAN.md §2.2 problema 2).
  const [updated] = await prisma.$transaction([
    SettingsRepository.update(input),
    AuditRepository.createOperation(
      AuditService.buildAuditData({
        action: AuditAction.UPDATE_SETTINGS,
        targetType: "AppSettings",
        targetId: SettingsRepository.SETTINGS_ID,
        metadata: { changed },
      }),
    ),
  ]);

  // El cache de módulo se refresca recién acá: si la transacción falla, el
  // cache tiene que seguir reflejando lo que hay en la base.
  cached = updated;
  return updated;
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
