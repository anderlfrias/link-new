import { FileProvider } from "@prisma/client";
import * as FileRepository from "../modules/files/file.repository";
import * as SettingsService from "../modules/settings/settings.service";
import { getProvider, LocalDiskStorage, S3Storage } from "../storage";

export interface MigrationSweepResult {
  migratedCount: number;
  failedCount: number;
  skippedCount: number;
}

/// Ejecuta una pasada de migración de archivos locales hacia S3 (§7.4).
/// INVARIANTE CRÍTICO: subir stream -> verificar HeadObject -> UPDATE provider='S3' -> (opcional) borrar local.
/// Nunca borrar-y-después-actualizar. Idempotente por construcción: si falla, la fila permanece en LOCAL.
export async function runFileMigrationSweep(): Promise<MigrationSweepResult> {
  const settings = await SettingsService.getSettings();
  if (!settings.fileMigrationEnabled) {
    return { migratedCount: 0, failedCount: 0, skippedCount: 0 };
  }

  const batchSize = Math.max(settings.fileMigrationBatchSize, 1);
  const filesToMigrate = await FileRepository.findBatchForMigration(batchSize);

  if (filesToMigrate.length === 0) {
    return { migratedCount: 0, failedCount: 0, skippedCount: 0 };
  }

  const localDisk = getProvider(FileProvider.LOCAL) as LocalDiskStorage;
  const s3Storage = getProvider(FileProvider.S3) as S3Storage;

  let migratedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const file of filesToMigrate) {
    try {
      // 1. Verificar existencia física en disco local
      let localStat: { size: number };
      try {
        localStat = await localDisk.stat(file.path);
      } catch (statError) {
        console.error(`[file-migration] Local file missing on disk for StoredFile ${file.id} (path: ${file.path})`, statError);
        failedCount++;
        continue;
      }

      // 2. Leer stream de disco local y subir a S3
      const readStream = await localDisk.createReadStream(file.path);
      if (s3Storage.saveStream) {
        await s3Storage.saveStream(readStream, file.path, {
          size: localStat.size,
          mimeType: file.mimeType,
        });
      } else {
        // Fallback en caso de mock o entorno sin saveStream
        const chunks: Buffer[] = [];
        for await (const chunk of readStream as any) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        await s3Storage.save(Buffer.concat(chunks), file.path);
      }

      // 3. Verificar en S3 (HeadObject) que el tamaño coincida exactamente
      const s3Stat = await s3Storage.stat(file.path);
      if (s3Stat.size !== localStat.size) {
        console.error(
          `[file-migration] Size mismatch for StoredFile ${file.id}: local=${localStat.size} bytes, s3=${s3Stat.size} bytes. Aborting migration for this file.`,
        );
        // Deshacer objeto inconsistente en S3
        try {
          await s3Storage.delete(file.path);
        } catch {
          // Ignorar error al limpiar objeto erróneo
        }
        failedCount++;
        continue;
      }

      // 4. Invariante de seguridad: COMMIT a Postgres solo tras verificación exitosa
      await FileRepository.updateFileProvider(file.id, FileProvider.S3);
      migratedCount++;
      console.log(`[file-migration] Migrated StoredFile ${file.id} to S3 (size: ${localStat.size} bytes)`);

      // 5. Borrado del archivo local (estrictamente DESPUÉS del commit, solo si está configurado)
      if (settings.fileMigrationDeleteLocalAfterCommit) {
        try {
          await localDisk.delete(file.path);
          console.log(`[file-migration] Deleted local copy for StoredFile ${file.id}`);
        } catch (delError) {
          console.error(`[file-migration] Failed to delete local file copy for ${file.id}`, delError);
        }
      }
    } catch (error) {
      console.error(`[file-migration] Unexpected error migrating StoredFile ${file.id}`, error);
      failedCount++;
    }
  }

  return { migratedCount, failedCount, skippedCount };
}

let lastSweepTime = 0;

/// Tarea periódica: evalúa el intervalo configurado en AppSettings y dispara la migración si corresponde.
export async function tickFileMigration(): Promise<void> {
  try {
    const settings = await SettingsService.getSettings();
    if (!settings.fileMigrationEnabled) {
      return;
    }

    const intervalMs = Math.max(settings.fileMigrationIntervalMinutes, 1) * 60 * 1000;
    const now = Date.now();
    if (now - lastSweepTime < intervalMs) {
      return;
    }

    lastSweepTime = now;
    await runFileMigrationSweep();
  } catch (error) {
    console.error("[file-migration] Error in migration tick", error);
  }
}

/// Inicia el worker de migración progresiva en segundo plano.
export function startFileMigrationWorker(): void {
  // Ejecutar primer tick al iniciar
  void tickFileMigration();
  // Revisar cada minuto si corresponde ejecutar según el intervalo de configuración
  setInterval(() => {
    void tickFileMigration();
  }, 60 * 1000);
}
