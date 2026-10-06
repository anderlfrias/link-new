import { AppSettings, AuditAction, ConversationGroupSettings } from "@prisma/client";
import env from "../../config/env";
import { prisma } from "../../config/prisma";
import { effectiveMinLength } from "../auth/password";
import * as AuditRepository from "../audit/audit.repository";
import * as AuditService from "../audit/audit.service";
import * as SettingsRepository from "./settings.repository";
import {
  EffectiveGroupSettings,
  GroupOverrideAllowedFlags,
  LocalAuthPolicy,
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

/// Lectura en curso de la fila singleton, compartida por todos los llamados
/// que llegan con el cache vacío. Sin esto, al arrancar el server los workers
/// piden la configuración a la vez y cada uno dispara su propio upsert: en una
/// base nueva (sin la fila todavía) esos upserts compiten por insertar el mismo
/// id, uno falla por unique constraint y el proceso se cae en el primer arranque.
let pending: Promise<AppSettings> | null = null;

export function _resetCacheForTesting(): void {
  cached = null;
  pending = null;
}

export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached;
  if (!pending) {
    pending = SettingsRepository.getOrCreate()
      .then((settings) => {
        cached = settings;
        return settings;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
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
    // Sin GIPHY_API_KEY los endpoints de /giphy responden 503 (ver
    // giphy.service.ts): se informa apagado para que el frontend no muestre
    // pestañas que solo darían error — mismo efecto que si un admin hubiera
    // desactivado la opción. GIPHY queda así deshabilitado por configuración
    // (ver modules/giphy/README.md, "Requisitos de GIPHY").
    allowStickersAndGifs: settings.allowStickersAndGifs && Boolean(env.GIPHY_API_KEY),
  };
}

const LOCAL_SESSION_TTL_HOURS_MIN = 1;
const LOCAL_SESSION_TTL_HOURS_MAX = 720;
/// Tope del historial (D15): verificar cada contraseña anterior cuesta un
/// scrypt, y se hace en cada cambio.
const PASSWORD_HISTORY_MAX = 12;
const MIN_FAILED_LOGIN_ATTEMPTS = 3;

/// Política del modo local con los pisos ya aplicados: aunque la fila tenga un
/// valor fuera de rango (escrito a mano en la base, o de antes de una
/// validación), nunca rige un largo menor a 8 ni una sesión de 0 horas.
export async function getLocalAuthPolicy(): Promise<LocalAuthPolicy> {
  const settings = await getSettings();
  return {
    sessionTtlHours: Math.min(
      Math.max(settings.localSessionTtlHours, LOCAL_SESSION_TTL_HOURS_MIN),
      LOCAL_SESSION_TTL_HOURS_MAX,
    ),
    minLength: effectiveMinLength(settings.passwordMinLength),
    requireUppercase: settings.passwordRequireUppercase,
    requireLowercase: settings.passwordRequireLowercase,
    requireNumber: settings.passwordRequireNumber,
    requireSymbol: settings.passwordRequireSymbol,
    expirationDays: settings.passwordExpirationDays,
    historyCount: Math.min(Math.max(settings.passwordHistoryCount, 0), PASSWORD_HISTORY_MAX),
    // Un valor por debajo de 3 (escrito a mano en la base) bloquearía cuentas
    // ante el primer typo: rige el mínimo del validador.
    maxFailedLoginAttempts:
      settings.maxFailedLoginAttempts === null
        ? null
        : Math.max(settings.maxFailedLoginAttempts, MIN_FAILED_LOGIN_ATTEMPTS),
    lockoutDurationMinutes: Math.max(settings.lockoutDurationMinutes, 1),
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
/// estaba permitido. Única función que debe usarse para leer estas 6
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
    whoCanLeaveGroup:
      settings.allowGroupOverrideLeaveGroup && override?.whoCanLeaveGroup != null
        ? override.whoCanLeaveGroup
        : settings.whoCanLeaveGroup,
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
    whoCanLeaveGroup: settings.allowGroupOverrideLeaveGroup,
  };
}
