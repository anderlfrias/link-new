import { AppSettings } from "@prisma/client";
import env from "../../config/env";
import { prisma } from "../../config/prisma";
import { UpdateSettingsInput } from "./settings.types";

export const SETTINGS_ID = "singleton";

/// Garantiza que la fila única de configuración exista, sin necesitar un
/// script de seed aparte. Los valores de creación de `maxUploadSizeMb` toman
/// el `.env` existente (`MAX_UPLOAD_SIZE_MB`), así el primer deploy de esta
/// feature no pierde el límite que el operador ya tenía configurado — después
/// de esta primera lectura, la fila en la base manda y el `.env` queda inerte
/// para este propósito.
export function getOrCreate(): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, maxUploadSizeMb: env.MAX_UPLOAD_SIZE_MB },
  });
}

export function update(data: UpdateSettingsInput) {
  return prisma.appSettings.update({ where: { id: SETTINGS_ID }, data });
}
