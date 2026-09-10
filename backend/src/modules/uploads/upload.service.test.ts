import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProvider, FileTypeRestrictionMode, FileUploadStatus } from "@prisma/client";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/errors";

const {
  mockUploadRepo,
  mockFileRepo,
  mockConversationRepo,
  mockSettingsService,
  mockS3Storage,
} = vi.hoisted(() => ({
  mockUploadRepo: {
    createUpload: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    countActiveUploadsByUser: vi.fn(),
    markCompleted: vi.fn(),
  },
  mockFileRepo: {
    createStoredFile: vi.fn(),
  },
  mockConversationRepo: {
    isConversationMember: vi.fn(),
  },
  mockSettingsService: {
    getSettings: vi.fn(),
  },
  mockS3Storage: {
    createMultipartUpload: vi.fn(),
    getPresignedPartUploadUrl: vi.fn(),
    listParts: vi.fn(),
    completeMultipartUpload: vi.fn(),
    abortMultipartUpload: vi.fn(),
    stat: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./upload.repository", () => mockUploadRepo);
vi.mock("../files/file.repository", () => mockFileRepo);
vi.mock("../conversations/conversation.repository", () => mockConversationRepo);
vi.mock("../settings/settings.service", () => mockSettingsService);
vi.mock("../../storage", () => ({
  getProvider: vi.fn().mockImplementation((provider: FileProvider) => {
    if (provider === FileProvider.S3) return mockS3Storage;
    return mockS3Storage;
  }),
}));

import * as UploadService from "./upload.service";

describe("UploadService", () => {
  const defaultSettings = {
    maxUploadSizeMb: 100,
    fileTypeRestrictionMode: FileTypeRestrictionMode.DISABLED,
    fileTypeList: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsService.getSettings.mockResolvedValue(defaultSettings);
    mockUploadRepo.countActiveUploadsByUser.mockResolvedValue(0);
    mockS3Storage.createMultipartUpload.mockResolvedValue("s3-upload-123");
    mockS3Storage.getPresignedPartUploadUrl.mockResolvedValue("https://s3.example.com/presigned-part");
    mockS3Storage.listParts.mockResolvedValue([]);
    mockS3Storage.completeMultipartUpload.mockResolvedValue(undefined);
    mockS3Storage.abortMultipartUpload.mockResolvedValue(undefined);
    mockS3Storage.stat.mockResolvedValue({ size: 24 * 1024 * 1024 });
    mockS3Storage.delete.mockResolvedValue(undefined);
  });

  describe("initiateUpload", () => {
    it("inicia sesión multipart correctamente y calcula totalParts con partes de 8 MiB", async () => {
      mockUploadRepo.createUpload.mockResolvedValue({
        id: "upload-session-1",
        objectKey: "chat/2026/09/uuid.mp4",
        totalParts: 3,
        partSize: 8 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      });

      const res = await UploadService.initiateUpload("user-1", {
        name: "video.mp4",
        size: 24 * 1024 * 1024, // 24 MiB -> 3 partes de 8 MiB
        mimeType: "video/mp4",
      });

      expect(mockS3Storage.createMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^chat\/\d{4}\/\d{2}\/[a-f0-9-]+\.mp4$/),
        "video/mp4",
      );
      expect(mockUploadRepo.createUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: FileProvider.S3,
          originalName: "video.mp4",
          totalParts: 3,
          partSize: 8388608,
          createdById: "user-1",
        }),
      );
      expect(res.uploadSessionId).toBe("upload-session-1");
      expect(res.totalParts).toBe(3);
      expect(res.partSize).toBe(8388608);
    });

    it("rechaza si el usuario no es miembro de la conversación", async () => {
      mockConversationRepo.isConversationMember.mockResolvedValue(false);

      await expect(
        UploadService.initiateUpload("user-1", {
          name: "archivo.pdf",
          size: 20 * 1024 * 1024,
          mimeType: "application/pdf",
          conversationId: "conv-1",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rechaza si el tamaño declarado excede maxUploadSizeMb", async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        ...defaultSettings,
        maxUploadSizeMb: 10,
      });

      await expect(
        UploadService.initiateUpload("user-1", {
          name: "grande.zip",
          size: 15 * 1024 * 1024,
          mimeType: "application/zip",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("rechaza si el tipo de archivo está bloqueado por BLOCKLIST", async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        ...defaultSettings,
        fileTypeRestrictionMode: FileTypeRestrictionMode.BLOCKLIST,
        fileTypeList: ["application/x-msdownload", "video/*"],
      });

      await expect(
        UploadService.initiateUpload("user-1", {
          name: "video.mp4",
          size: 20 * 1024 * 1024,
          mimeType: "video/mp4",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("rechaza con 409 Conflict si el usuario alcanza la cuota de sesiones activas (S5)", async () => {
      mockUploadRepo.countActiveUploadsByUser.mockResolvedValue(5);

      await expect(
        UploadService.initiateUpload("user-1", {
          name: "doc.pdf",
          size: 20 * 1024 * 1024,
          mimeType: "application/pdf",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("getUploadStatus", () => {
    it("retorna estado y partes subidas según ListParts para el creador", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-1",
        status: FileUploadStatus.UPLOADING,
        originalName: "video.mp4",
        declaredSize: BigInt(24 * 1024 * 1024),
        partSize: 8388608,
        totalParts: 3,
        objectKey: "chat/video.mp4",
        externalUploadId: "s3-upload-123",
        provider: FileProvider.S3,
        expiresAt: new Date(),
      });

      mockS3Storage.listParts.mockResolvedValue([
        { partNumber: 1, size: 8388608, eTag: "etag-1" },
      ]);

      const res = await UploadService.getUploadStatus("upload-1", "user-1");

      expect(res.id).toBe("upload-1");
      expect(res.status).toBe(FileUploadStatus.UPLOADING);
      expect(res.parts).toEqual([{ partNumber: 1, size: 8388608, eTag: "etag-1" }]);
    });

    it("permite el acceso a administradores aunque no sean el creador", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-otro",
        status: FileUploadStatus.PENDING,
        originalName: "video.mp4",
        declaredSize: BigInt(1000),
        partSize: 8388608,
        totalParts: 1,
        objectKey: "chat/video.mp4",
        externalUploadId: "s3-upload-123",
        provider: FileProvider.S3,
        expiresAt: new Date(),
      });

      const res = await UploadService.getUploadStatus("upload-1", "admin-user", [ADMIN_ROLE]);
      expect(res.id).toBe("upload-1");
    });

    it("rechaza con 403 Forbidden a usuarios que no son creadores ni admins (S11 IDOR)", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-otro",
        status: FileUploadStatus.PENDING,
      });

      await expect(
        UploadService.getUploadStatus("upload-1", "user-intruso", []),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rechaza con 404 NotFound si la sesión no existe", async () => {
      mockUploadRepo.findById.mockResolvedValue(null);

      await expect(
        UploadService.getUploadStatus("inexistente", "user-1"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getPartUrls", () => {
    const mockActiveUpload = {
      id: "upload-1",
      createdById: "user-1",
      status: FileUploadStatus.PENDING,
      totalParts: 4,
      objectKey: "chat/video.mp4",
      externalUploadId: "s3-upload-123",
      provider: FileProvider.S3,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };

    it("genera URLs presignadas para las partes pedidas y pasa estado a UPLOADING", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockActiveUpload);
      mockS3Storage.getPresignedPartUploadUrl.mockImplementation(
        (_key, _uid, partNum) => Promise.resolve(`https://s3.example.com/part-${partNum}`),
      );

      const urls = await UploadService.getPartUrls("upload-1", "user-1", [], {
        partNumbers: [1, 2],
      });

      expect(mockUploadRepo.updateStatus).toHaveBeenCalledWith("upload-1", FileUploadStatus.UPLOADING);
      expect(urls).toEqual([
        { partNumber: 1, url: "https://s3.example.com/part-1" },
        { partNumber: 2, url: "https://s3.example.com/part-2" },
      ]);
    });

    it("rechaza si algún número de parte está fuera de rango (1..totalParts)", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockActiveUpload);

      await expect(
        UploadService.getPartUrls("upload-1", "user-1", [], { partNumbers: [0] }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        UploadService.getPartUrls("upload-1", "user-1", [], { partNumbers: [5] }),
      ).rejects.toThrow(BadRequestError);
    });

    it("rechaza si la sesión está expirada", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        ...mockActiveUpload,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        UploadService.getPartUrls("upload-1", "user-1", [], { partNumbers: [1] }),
      ).rejects.toThrow(BadRequestError);
    });

    it("rechaza con 403 Forbidden a usuarios no autorizados (S11)", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockActiveUpload);

      await expect(
        UploadService.getPartUrls("upload-1", "user-ajeno", [], { partNumbers: [1] }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("completeUpload", () => {
    const mockUploadForComplete = {
      id: "upload-1",
      createdById: "user-1",
      status: FileUploadStatus.UPLOADING,
      totalParts: 2,
      objectKey: "chat/conv/2026/09/archivo.mp4",
      originalName: "archivo.mp4",
      mimeType: "video/mp4",
      extension: "mp4",
      declaredSize: BigInt(16 * 1024 * 1024),
      externalUploadId: "s3-upload-123",
      provider: FileProvider.S3,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };

    it("completa la subida multipart, valida tamaño real con HeadObject y crea StoredFile", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockUploadForComplete);
      mockS3Storage.listParts.mockResolvedValue([
        { partNumber: 2, size: 8388608, eTag: '"etag-2"' },
        { partNumber: 1, size: 8388608, eTag: '"etag-1"' },
      ]);
      mockS3Storage.stat.mockResolvedValue({ size: 16777216 }); // 16 MiB real

      mockFileRepo.createStoredFile.mockResolvedValue({
        id: "stored-file-1",
        originalName: "archivo.mp4",
        storedName: "archivo.mp4",
        path: "chat/conv/2026/09/archivo.mp4",
        mimeType: "video/mp4",
        extension: "mp4",
        size: BigInt(16777216),
        provider: FileProvider.S3,
        checksum: "sha256-hash",
        createdById: "user-1",
        createdAt: new Date(),
        deletedAt: null,
      });

      const res = await UploadService.completeUpload("upload-1", "user-1", [], {
        checksum: "sha256-hash",
      });

      expect(mockS3Storage.completeMultipartUpload).toHaveBeenCalledWith(
        "chat/conv/2026/09/archivo.mp4",
        "s3-upload-123",
        [
          { partNumber: 1, eTag: '"etag-1"' },
          { partNumber: 2, eTag: '"etag-2"' },
        ],
      );
      expect(mockS3Storage.stat).toHaveBeenCalledWith("chat/conv/2026/09/archivo.mp4");
      expect(mockFileRepo.createStoredFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: "archivo.mp4",
          size: BigInt(16777216),
          provider: FileProvider.S3,
        }),
      );
      expect(mockUploadRepo.markCompleted).toHaveBeenCalledWith("upload-1", "stored-file-1", "sha256-hash");
      expect(res.id).toBe("stored-file-1");
      expect(res.size).toBe(16777216);
    });

    it("falla si faltan partes por subir en el storage", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockUploadForComplete);
      // Solo devolvemos la parte 1, falta la 2
      mockS3Storage.listParts.mockResolvedValue([
        { partNumber: 1, size: 8388608, eTag: '"etag-1"' },
      ]);

      await expect(
        UploadService.completeUpload("upload-1", "user-1", [], {}),
      ).rejects.toThrow(BadRequestError);

      expect(mockS3Storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it("INVARIANTE S1: si tamaño real excede el límite permitido, borra el objeto, marca FAILED y lanza 400", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockUploadForComplete);
      mockS3Storage.listParts.mockResolvedValue([
        { partNumber: 1, size: 8388608, eTag: '"etag-1"' },
        { partNumber: 2, size: 8388608, eTag: '"etag-2"' },
      ]);
      // Simulamos que HeadObject revela 200 MB cuando el límite de settings es 100 MB
      mockS3Storage.stat.mockResolvedValue({ size: 200 * 1024 * 1024 });

      await expect(
        UploadService.completeUpload("upload-1", "user-1", [], {}),
      ).rejects.toThrow(/File exceeds maximum allowed size/);

      // Verificación obligatoria de acciones mitigantes S1
      expect(mockS3Storage.delete).toHaveBeenCalledWith("chat/conv/2026/09/archivo.mp4");
      expect(mockUploadRepo.updateStatus).toHaveBeenCalledWith(
        "upload-1",
        FileUploadStatus.FAILED,
        expect.objectContaining({ closedAt: expect.any(Date) }),
      );
      expect(mockFileRepo.createStoredFile).not.toHaveBeenCalled();
    });

    it("rechaza con 403 Forbidden a usuarios no autorizados (S11)", async () => {
      mockUploadRepo.findById.mockResolvedValue(mockUploadForComplete);

      await expect(
        UploadService.completeUpload("upload-1", "user-ajeno", [], {}),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("abortUpload", () => {
    it("aborta la sesión multipart en S3 y la marca como ABORTED", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-1",
        status: FileUploadStatus.UPLOADING,
        objectKey: "chat/video.mp4",
        externalUploadId: "s3-upload-123",
        provider: FileProvider.S3,
      });

      const res = await UploadService.abortUpload("upload-1", "user-1");

      expect(mockS3Storage.abortMultipartUpload).toHaveBeenCalledWith("chat/video.mp4", "s3-upload-123");
      expect(mockUploadRepo.updateStatus).toHaveBeenCalledWith(
        "upload-1",
        FileUploadStatus.ABORTED,
        expect.objectContaining({ closedAt: expect.any(Date) }),
      );
      expect(res.message).toBe("Upload session aborted successfully");
    });

    it("es idempotente si la sesión ya está ABORTED", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-1",
        status: FileUploadStatus.ABORTED,
      });

      const res = await UploadService.abortUpload("upload-1", "user-1");
      expect(res.message).toBe("Upload session already aborted");
      expect(mockS3Storage.abortMultipartUpload).not.toHaveBeenCalled();
    });

    it("falla con 400 Bad Request si la sesión ya está COMPLETED", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-1",
        status: FileUploadStatus.COMPLETED,
      });

      await expect(UploadService.abortUpload("upload-1", "user-1")).rejects.toThrow(BadRequestError);
    });

    it("rechaza con 403 Forbidden a usuarios ajenos (S11)", async () => {
      mockUploadRepo.findById.mockResolvedValue({
        id: "upload-1",
        createdById: "user-1",
        status: FileUploadStatus.UPLOADING,
      });

      await expect(UploadService.abortUpload("upload-1", "user-ajeno")).rejects.toThrow(ForbiddenError);
    });
  });
});
