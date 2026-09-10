import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProvider } from "@prisma/client";

const { mockFileRepository, mockSettingsService, mockLocalStorage, mockS3Storage } = vi.hoisted(() => ({
  mockFileRepository: {
    findBatchForMigration: vi.fn(),
    updateFileProvider: vi.fn(),
  },
  mockSettingsService: {
    getSettings: vi.fn(),
  },
  mockLocalStorage: {
    stat: vi.fn(),
    createReadStream: vi.fn(),
    delete: vi.fn(),
  },
  mockS3Storage: {
    saveStream: vi.fn(),
    stat: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../modules/files/file.repository", () => mockFileRepository);
vi.mock("../modules/settings/settings.service", () => mockSettingsService);

vi.mock("../storage", () => ({
  getProvider: vi.fn((provider: string) => {
    if (provider === "S3") return mockS3Storage;
    return mockLocalStorage;
  }),
  LocalDiskStorage: vi.fn(),
  S3Storage: vi.fn(),
}));

import { runFileMigrationSweep } from "./file-migration.worker";

describe("file-migration.worker", () => {
  const sampleFile1 = {
    id: "f-local-1",
    originalName: "avatar.png",
    storedName: "uuid-1.png",
    path: "avatars/u-1/uuid-1.png",
    mimeType: "image/png",
    extension: "png",
    size: 1024n,
    provider: FileProvider.LOCAL,
    deletedAt: null,
  };

  const sampleFile2 = {
    id: "f-local-2",
    originalName: "reporte.pdf",
    storedName: "uuid-2.pdf",
    path: "chat/conv-1/2026/09/uuid-2.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    size: 2048n,
    provider: FileProvider.LOCAL,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsService.getSettings.mockResolvedValue({
      fileMigrationEnabled: true,
      fileMigrationBatchSize: 50,
      fileMigrationIntervalMinutes: 60,
      fileMigrationDeleteLocalAfterCommit: false,
    });
    mockFileRepository.findBatchForMigration.mockResolvedValue([]);
    mockFileRepository.updateFileProvider.mockResolvedValue({});
    mockLocalStorage.stat.mockResolvedValue({ size: 1024 });
    mockLocalStorage.createReadStream.mockResolvedValue({ pipe: vi.fn() });
    mockLocalStorage.delete.mockResolvedValue(undefined);
    mockS3Storage.saveStream.mockResolvedValue({ path: "test", size: 1024 });
    mockS3Storage.stat.mockResolvedValue({ size: 1024 });
    mockS3Storage.delete.mockResolvedValue(undefined);
  });

  it("no ejecuta ninguna migración si fileMigrationEnabled es false", async () => {
    mockSettingsService.getSettings.mockResolvedValue({
      fileMigrationEnabled: false,
      fileMigrationBatchSize: 50,
      fileMigrationIntervalMinutes: 60,
      fileMigrationDeleteLocalAfterCommit: false,
    });

    const result = await runFileMigrationSweep();

    expect(result).toEqual({ migratedCount: 0, failedCount: 0, skippedCount: 0 });
    expect(mockFileRepository.findBatchForMigration).not.toHaveBeenCalled();
    expect(mockS3Storage.saveStream).not.toHaveBeenCalled();
  });

  it("retorna 0 si no hay archivos locales pendientes de migrar", async () => {
    mockFileRepository.findBatchForMigration.mockResolvedValue([]);

    const result = await runFileMigrationSweep();

    expect(result).toEqual({ migratedCount: 0, failedCount: 0, skippedCount: 0 });
    expect(mockFileRepository.findBatchForMigration).toHaveBeenCalledWith(50);
  });

  it("migra archivos exitosamente respetando el orden por tamaño ascendente", async () => {
    mockFileRepository.findBatchForMigration.mockResolvedValue([sampleFile1, sampleFile2]);
    mockLocalStorage.stat
      .mockResolvedValueOnce({ size: 1024 })
      .mockResolvedValueOnce({ size: 2048 });
    mockS3Storage.stat
      .mockResolvedValueOnce({ size: 1024 })
      .mockResolvedValueOnce({ size: 2048 });

    const result = await runFileMigrationSweep();

    expect(result).toEqual({ migratedCount: 2, failedCount: 0, skippedCount: 0 });
    expect(mockS3Storage.saveStream).toHaveBeenCalledTimes(2);
    expect(mockFileRepository.updateFileProvider).toHaveBeenNthCalledWith(
      1,
      "f-local-1",
      FileProvider.S3,
    );
    expect(mockFileRepository.updateFileProvider).toHaveBeenNthCalledWith(
      2,
      "f-local-2",
      FileProvider.S3,
    );
    // Por defecto fileMigrationDeleteLocalAfterCommit es false -> no borra
    expect(mockLocalStorage.delete).not.toHaveBeenCalled();
  });

  it("si el archivo físico local no existe en disco, lo saltea sin actualizar la base", async () => {
    mockFileRepository.findBatchForMigration.mockResolvedValue([sampleFile1]);
    mockLocalStorage.stat.mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));

    const result = await runFileMigrationSweep();

    expect(result).toEqual({ migratedCount: 0, failedCount: 1, skippedCount: 0 });
    expect(mockS3Storage.saveStream).not.toHaveBeenCalled();
    expect(mockFileRepository.updateFileProvider).not.toHaveBeenCalled();
  });

  it("si la subida a S3 falla, la fila permanece en LOCAL (idempotencia §7.4)", async () => {
    mockFileRepository.findBatchForMigration.mockResolvedValue([sampleFile1]);
    mockS3Storage.saveStream.mockRejectedValueOnce(new Error("S3 Network timeout"));

    const result = await runFileMigrationSweep();

    expect(result).toEqual({ migratedCount: 0, failedCount: 1, skippedCount: 0 });
    expect(mockFileRepository.updateFileProvider).not.toHaveBeenCalled();
    expect(mockLocalStorage.delete).not.toHaveBeenCalled();
  });

  it("si el tamaño verificado con HeadObject no coincide, aborta sin commitear y borra de S3", async () => {
    mockFileRepository.findBatchForMigration.mockResolvedValue([sampleFile1]);
    mockLocalStorage.stat.mockResolvedValueOnce({ size: 1024 });
    // S3 reporta un tamaño corrupto o incompleto
    mockS3Storage.stat.mockResolvedValueOnce({ size: 512 });

    const result = await runFileMigrationSweep();

    expect(result).toEqual({ migratedCount: 0, failedCount: 1, skippedCount: 0 });
    expect(mockS3Storage.delete).toHaveBeenCalledWith(sampleFile1.path);
    expect(mockFileRepository.updateFileProvider).not.toHaveBeenCalled();
    expect(mockLocalStorage.delete).not.toHaveBeenCalled();
  });

  it("invariante de orden: el borrado local NUNCA ocurre antes del commit (§7.4)", async () => {
    mockSettingsService.getSettings.mockResolvedValue({
      fileMigrationEnabled: true,
      fileMigrationBatchSize: 50,
      fileMigrationIntervalMinutes: 60,
      fileMigrationDeleteLocalAfterCommit: true,
    });
    mockFileRepository.findBatchForMigration.mockResolvedValue([sampleFile1]);

    const callOrder: string[] = [];
    mockS3Storage.saveStream.mockImplementation(async () => {
      callOrder.push("s3:save");
      return { path: sampleFile1.path, size: 1024 };
    });
    mockS3Storage.stat.mockImplementation(async () => {
      callOrder.push("s3:stat");
      return { size: 1024 };
    });
    mockFileRepository.updateFileProvider.mockImplementation(async () => {
      callOrder.push("db:commit");
      return {} as any;
    });
    mockLocalStorage.delete.mockImplementation(async () => {
      callOrder.push("local:delete");
    });

    const result = await runFileMigrationSweep();

    expect(result.migratedCount).toBe(1);
    expect(callOrder).toEqual(["s3:save", "s3:stat", "db:commit", "local:delete"]);
  });
});
