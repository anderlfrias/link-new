import { FileUploadStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import * as SettingsService from "../modules/settings/settings.service";
import { getProvider } from "../storage";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // Cada 1 hora

/// Ejecuta el barrido de limpieza de sesiones de subida y archivos según configuración de AppSettings (§5.5).
/// Todas las tareas respetan `uploadCleanupEnabled: false` (apagado por defecto) y `uploadCleanupDryRun`.
export async function runUploadCleanupSweep(): Promise<{
  expiredSessionsCount: number;
  orphanFilesCount: number;
  purgedFilesCount: number;
}> {
  const settings = await SettingsService.getSettings();
  if (!settings.uploadCleanupEnabled) {
    return { expiredSessionsCount: 0, orphanFilesCount: 0, purgedFilesCount: 0 };
  }

  const isDryRun = settings.uploadCleanupDryRun;
  const now = new Date();
  let expiredSessionsCount = 0;
  let orphanFilesCount = 0;
  let purgedFilesCount = 0;

  // =========================================================================
  // Tarea 1: Barrido de sesiones multipart expiradas / abandonadas
  // =========================================================================
  const expiredUploads = await prisma.fileUpload.findMany({
    where: {
      status: { in: [FileUploadStatus.PENDING, FileUploadStatus.UPLOADING] },
      expiresAt: { lt: now },
    },
  });

  for (const upload of expiredUploads) {
    expiredSessionsCount++;
    if (isDryRun) {
      console.log(
        `[upload-cleanup] [dry-run] Would abort expired upload session ${upload.id} (objectKey: ${upload.objectKey})`,
      );
      continue;
    }

    if (upload.externalUploadId) {
      try {
        const storageProvider = getProvider(upload.provider);
        if (storageProvider.abortMultipartUpload) {
          await storageProvider.abortMultipartUpload(upload.objectKey, upload.externalUploadId);
        }
      } catch (error) {
        console.error(
          `[upload-cleanup] Failed to abort multipart upload in storage for session ${upload.id}`,
          error,
        );
      }
    }

    await prisma.fileUpload.update({
      where: { id: upload.id },
      data: {
        status: FileUploadStatus.EXPIRED,
        closedAt: now,
      },
    });
    console.log(`[upload-cleanup] Aborted expired upload session ${upload.id}`);
  }

  // =========================================================================
  // Tarea 2: Barrido de StoredFile huérfanos (completados sin referencias > N h)
  // =========================================================================
  if (settings.orphanFileRetentionHours != null && settings.orphanFileRetentionHours > 0) {
    const orphanCutoff = new Date(now.getTime() - settings.orphanFileRetentionHours * 60 * 60 * 1000);

    const orphanFiles = await prisma.storedFile.findMany({
      where: {
        deletedAt: null,
        createdAt: { lt: orphanCutoff },
        avatarOfUsers: { none: {} },
        imageOfConversations: { none: {} },
        messageFiles: { none: {} },
      },
    });

    for (const file of orphanFiles) {
      orphanFilesCount++;
      if (isDryRun) {
        console.log(`[upload-cleanup] [dry-run] Would delete orphan StoredFile ${file.id} (path: ${file.path})`);
        continue;
      }

      try {
        const storageProvider = getProvider(file.provider);
        await storageProvider.delete(file.path);
      } catch (error) {
        console.error(`[upload-cleanup] Failed to delete physical file for orphan ${file.id}`, error);
      }

      await prisma.storedFile.update({
        where: { id: file.id },
        data: {
          deletedAt: now,
          purgedAt: now,
        },
      });
      console.log(`[upload-cleanup] Soft-deleted and purged orphan StoredFile ${file.id}`);
    }
  }

  // =========================================================================
  // Tarea 3: Purga física de archivos soft-deleted antiguos (> M días)
  // INVARIANTE: La fila en Postgres NUNCA se borra; solo se liberan los bytes.
  // =========================================================================
  if (settings.softDeletedFilePurgeDays != null && settings.softDeletedFilePurgeDays > 0) {
    const purgeCutoff = new Date(now.getTime() - settings.softDeletedFilePurgeDays * 24 * 60 * 60 * 1000);

    const filesToPurge = await prisma.storedFile.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: purgeCutoff,
        },
        purgedAt: null,
      },
    });

    for (const file of filesToPurge) {
      purgedFilesCount++;
      if (isDryRun) {
        console.log(
          `[upload-cleanup] [dry-run] Would purge physical bytes for soft-deleted StoredFile ${file.id} (path: ${file.path})`,
        );
        continue;
      }

      try {
        const storageProvider = getProvider(file.provider);
        await storageProvider.delete(file.path);
      } catch (error) {
        console.error(`[upload-cleanup] Failed to purge physical bytes for file ${file.id}`, error);
      }

      await prisma.storedFile.update({
        where: { id: file.id },
        data: {
          purgedAt: now,
        },
      });
      console.log(`[upload-cleanup] Purged physical bytes for soft-deleted StoredFile ${file.id}`);
    }
  }

  return { expiredSessionsCount, orphanFilesCount, purgedFilesCount };
}

/// Inicia el worker de limpieza automática en segundo plano.
export function startUploadCleanupWorker(): void {
  void runUploadCleanupSweep();
  setInterval(() => {
    void runUploadCleanupSweep();
  }, SWEEP_INTERVAL_MS);
}
