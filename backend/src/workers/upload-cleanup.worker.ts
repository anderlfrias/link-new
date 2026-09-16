import { FileUploadStatus } from "@prisma/client";
import { getLogger } from "../config/request-context";
import { prisma } from "../config/prisma";
import * as SettingsService from "../modules/settings/settings.service";
import { getProvider } from "../storage";
import { runWorkerTick } from "./worker-context";

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
      getLogger().info(
        { uploadId: upload.id, objectKey: upload.objectKey, dryRun: true },
        "expired upload session would be aborted",
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
        getLogger().error(
          { uploadId: upload.id, err: error },
          "failed to abort multipart upload in storage",
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
    getLogger().info({ uploadId: upload.id }, "aborted expired upload session");
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
        getLogger().info({ fileId: file.id, path: file.path, dryRun: true }, "orphan file would be deleted");
        continue;
      }

      try {
        const storageProvider = getProvider(file.provider);
        await storageProvider.delete(file.path);
      } catch (error) {
        getLogger().error({ fileId: file.id, err: error }, "failed to delete physical file for orphan");
      }

      await prisma.storedFile.update({
        where: { id: file.id },
        data: {
          deletedAt: now,
          purgedAt: now,
        },
      });
      getLogger().info({ fileId: file.id }, "soft-deleted and purged orphan file");
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
        getLogger().info(
          { fileId: file.id, path: file.path, dryRun: true },
          "physical bytes for soft-deleted file would be purged",
        );
        continue;
      }

      try {
        const storageProvider = getProvider(file.provider);
        await storageProvider.delete(file.path);
      } catch (error) {
        getLogger().error({ fileId: file.id, err: error }, "failed to purge physical bytes for file");
      }

      await prisma.storedFile.update({
        where: { id: file.id },
        data: {
          purgedAt: now,
        },
      });
      getLogger().info({ fileId: file.id }, "purged physical bytes for soft-deleted file");
    }
  }

  return { expiredSessionsCount, orphanFilesCount, purgedFilesCount };
}

// `runUploadCleanupSweep` devuelve un resumen de conteos (lo que sus propios
// tests assertean) — `runWorkerTick` exige `() => Promise<void>`, así que acá
// se descarta ese resultado. El resumen sigue disponible para quien llame a
// `runUploadCleanupSweep` directamente.
async function tick(): Promise<void> {
  await runUploadCleanupSweep();
}

/// Inicia el worker de limpieza automática en segundo plano.
export function startUploadCleanupWorker(): void {
  void runWorkerTick("upload-cleanup", tick);
  setInterval(() => {
    void runWorkerTick("upload-cleanup", tick);
  }, SWEEP_INTERVAL_MS);
}
