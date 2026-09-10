import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProvider, FileUploadStatus } from "@prisma/client";

const { mockPrisma, mockSettingsService, mockStorage } = vi.hoisted(() => ({
  mockPrisma: {
    fileUpload: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    storedFile: {
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  mockSettingsService: {
    getSettings: vi.fn(),
  },
  mockStorage: {
    abortMultipartUpload: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../config/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("../modules/settings/settings.service", () => mockSettingsService);

vi.mock("../storage", () => ({
  getProvider: vi.fn(() => mockStorage),
}));

import { runUploadCleanupSweep } from "./upload-cleanup.worker";

describe("upload-cleanup.worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.abortMultipartUpload.mockResolvedValue(undefined);
    mockStorage.delete.mockResolvedValue(undefined);
    mockPrisma.fileUpload.findMany.mockResolvedValue([]);
    mockPrisma.fileUpload.update.mockResolvedValue({});
    mockPrisma.storedFile.findMany.mockResolvedValue([]);
    mockPrisma.storedFile.update.mockResolvedValue({});
  });

  it("no ejecuta ninguna acción si uploadCleanupEnabled es false (default seguro)", async () => {
    mockSettingsService.getSettings.mockResolvedValue({
      uploadCleanupEnabled: false,
      orphanFileRetentionHours: 24,
      softDeletedFilePurgeDays: 30,
      uploadCleanupDryRun: false,
    });

    const result = await runUploadCleanupSweep();

    expect(result).toEqual({
      expiredSessionsCount: 0,
      orphanFilesCount: 0,
      purgedFilesCount: 0,
    });
    expect(mockPrisma.fileUpload.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.storedFile.findMany).not.toHaveBeenCalled();
    expect(mockStorage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it("modo Dry-Run: detecta elementos a limpiar pero no realiza modificaciones ni borrados", async () => {
    mockSettingsService.getSettings.mockResolvedValue({
      uploadCleanupEnabled: true,
      orphanFileRetentionHours: 24,
      softDeletedFilePurgeDays: 30,
      uploadCleanupDryRun: true,
    });

    mockPrisma.fileUpload.findMany.mockResolvedValue([
      {
        id: "upload-expired-1",
        objectKey: "chat/video.mp4",
        externalUploadId: "s3-uid",
        provider: FileProvider.S3,
      },
    ]);

    mockPrisma.storedFile.findMany
      .mockResolvedValueOnce([
        { id: "file-orphan-1", path: "chat/orphan.pdf", provider: FileProvider.S3 },
      ])
      .mockResolvedValueOnce([
        { id: "file-purged-1", path: "chat/old-deleted.jpg", provider: FileProvider.LOCAL },
      ]);

    const result = await runUploadCleanupSweep();

    expect(result).toEqual({
      expiredSessionsCount: 1,
      orphanFilesCount: 1,
      purgedFilesCount: 1,
    });

    // En dryRun NO se llama a update ni a delete
    expect(mockStorage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(mockStorage.delete).not.toHaveBeenCalled();
    expect(mockPrisma.fileUpload.update).not.toHaveBeenCalled();
    expect(mockPrisma.storedFile.update).not.toHaveBeenCalled();
    expect(mockPrisma.storedFile.delete).not.toHaveBeenCalled();
  });

  describe("Barrido de sesiones expiradas", () => {
    it("aborta sesiones expiradas en S3 y actualiza su estado a EXPIRED", async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        uploadCleanupEnabled: true,
        orphanFileRetentionHours: null,
        softDeletedFilePurgeDays: null,
        uploadCleanupDryRun: false,
      });

      mockPrisma.fileUpload.findMany.mockResolvedValue([
        {
          id: "session-exp-1",
          objectKey: "chat/large.mp4",
          externalUploadId: "s3-upload-id-123",
          provider: FileProvider.S3,
        },
      ]);

      const result = await runUploadCleanupSweep();

      expect(result.expiredSessionsCount).toBe(1);
      expect(mockStorage.abortMultipartUpload).toHaveBeenCalledWith(
        "chat/large.mp4",
        "s3-upload-id-123",
      );
      expect(mockPrisma.fileUpload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-exp-1" },
          data: expect.objectContaining({
            status: FileUploadStatus.EXPIRED,
            closedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("Barrido de archivos huérfanos", () => {
    it("elimina físicamente del storage y marca deletedAt/purgedAt a archivos huérfanos > N horas", async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        uploadCleanupEnabled: true,
        orphanFileRetentionHours: 24,
        softDeletedFilePurgeDays: null,
        uploadCleanupDryRun: false,
      });

      mockPrisma.storedFile.findMany.mockResolvedValue([
        {
          id: "orphan-file-1",
          path: "chat/2026/09/abandoned.pdf",
          provider: FileProvider.S3,
        },
      ]);

      const result = await runUploadCleanupSweep();

      expect(result.orphanFilesCount).toBe(1);
      expect(mockStorage.delete).toHaveBeenCalledWith("chat/2026/09/abandoned.pdf");
      expect(mockPrisma.storedFile.update).toHaveBeenCalledWith({
        where: { id: "orphan-file-1" },
        data: {
          deletedAt: expect.any(Date),
          purgedAt: expect.any(Date),
        },
      });
      // INVARIANTE: la fila en Postgres no se borra físicamente
      expect(mockPrisma.storedFile.delete).not.toHaveBeenCalled();
    });

    it("INVARIANTE CRÍTICO: el query exige cero referencias en mensajes, avatares o conversaciones", async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        uploadCleanupEnabled: true,
        orphanFileRetentionHours: 24,
        softDeletedFilePurgeDays: null,
        uploadCleanupDryRun: false,
      });

      await runUploadCleanupSweep();

      expect(mockPrisma.storedFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            avatarOfUsers: { none: {} },
            imageOfConversations: { none: {} },
            messageFiles: { none: {} },
          }),
        }),
      );
    });
  });

  describe("Purga física de soft-deleted antiguos", () => {
    it("elimina físicamente de storage y actualiza purgedAt sin borrar la fila en Postgres", async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        uploadCleanupEnabled: true,
        orphanFileRetentionHours: null,
        softDeletedFilePurgeDays: 30,
        uploadCleanupDryRun: false,
      });

      mockPrisma.storedFile.findMany.mockResolvedValue([
        {
          id: "soft-deleted-file-1",
          path: "chat/old-doc.pdf",
          provider: FileProvider.S3,
        },
      ]);

      const result = await runUploadCleanupSweep();

      expect(result.purgedFilesCount).toBe(1);
      expect(mockStorage.delete).toHaveBeenCalledWith("chat/old-doc.pdf");
      expect(mockPrisma.storedFile.update).toHaveBeenCalledWith({
        where: { id: "soft-deleted-file-1" },
        data: {
          purgedAt: expect.any(Date),
        },
      });
      // INVARIANTE: La fila en Postgres NUNCA se borra
      expect(mockPrisma.storedFile.delete).not.toHaveBeenCalled();
    });
  });
});
