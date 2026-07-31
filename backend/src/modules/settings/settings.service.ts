import { AppSettings } from "@prisma/client";
import * as SettingsRepository from "./settings.repository";
import { PublicAppSettingsDTO, UpdateSettingsInput } from "./settings.types";

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
  };
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
  cached = await SettingsRepository.update(input);
  return cached;
}
