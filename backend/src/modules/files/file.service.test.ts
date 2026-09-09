import { FileTypeRestrictionMode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";

vi.mock("../../storage", () => ({
  storage: {
    save: vi.fn((buf: Buffer, relPath: string) => Promise.resolve({ path: relPath, size: buf.length })),
    delete: vi.fn(() => Promise.resolve()),
    getPublicUrl: vi.fn((p: string) => `/uploads/${p}`),
  },
}));

vi.mock("../conversations/conversation.repository", () => ({
  isConversationMember: vi.fn(),
}));

vi.mock("./file.repository");
vi.mock("../settings/settings.service");
vi.mock("music-metadata", () => ({
  parseBuffer: vi.fn(),
}));

import { storage } from "../../storage";
import { isConversationMember } from "../conversations/conversation.repository";
import * as SettingsService from "../settings/settings.service";
import * as FileRepository from "./file.repository";
import { parseBuffer } from "music-metadata";
import {
  adminDeleteFile,
  deleteFile,
  getFile,
  getFileChecksum,
  listFilesForAdmin,
  storeAvatar,
  toStoredFileResponse,
  uploadFile,
} from "./file.service";

function buildMockStoredFile(overrides: any = {}) {
  return {
    id: "file-1",
    originalName: "documento.pdf",
    storedName: "stored-uuid.pdf",
    path: "chat/conv-1/2026/03/stored-uuid.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    size: 2048,
    checksum: "hash123",
    createdById: "u-uploader",
    createdAt: new Date("2026-03-01T12:00:00Z"),
    updatedAt: new Date("2026-03-01T12:00:00Z"),
    deletedAt: null,
    provider: "LOCAL",
    ...overrides,
  };
}

describe("file.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("toStoredFileResponse", () => {
    it("convierte StoredFile a StoredFileResponse generando url pública", () => {
      const file = buildMockStoredFile();
      const response = toStoredFileResponse(file as any);

      expect(response).toEqual({
        id: "file-1",
        originalName: "documento.pdf",
        mimeType: "application/pdf",
        extension: "pdf",
        size: 2048,
        url: "/uploads/chat/conv-1/2026/03/stored-uuid.pdf",
        createdAt: file.createdAt,
      });
      expect(storage.getPublicUrl).toHaveBeenCalledWith(file.path);
    });
  });

  describe("uploadFile", () => {
    const defaultSettings = {
      maxUploadSizeMb: 10,
      fileTypeRestrictionMode: FileTypeRestrictionMode.DISABLED,
      fileTypeList: [],
      maxVoiceNoteDurationSeconds: 60,
    };

    const validUpload = {
      originalname: "foto.png",
      mimetype: "image/png",
      buffer: Buffer.from("imagen de prueba"),
      size: 16,
    };

    it("rechaza si el usuario no es miembro de la conversación especificada", async () => {
      vi.mocked(isConversationMember).mockResolvedValue(false);

      await expect(
        uploadFile("u-1", validUpload, "conv-1"),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        uploadFile("u-1", validUpload, "conv-1"),
      ).rejects.toThrow("You are not a member of this conversation");
    });

    it("rechaza si el tamaño excede maxUploadSizeMb de AppSettings", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        ...defaultSettings,
        maxUploadSizeMb: 1, // 1 MB
      } as any);

      const bigBuffer = Buffer.alloc(2 * 1024 * 1024); // 2 MB
      const bigUpload = { ...validUpload, buffer: bigBuffer, size: bigBuffer.length };

      await expect(uploadFile("u-1", bigUpload)).rejects.toThrow(BadRequestError);
      await expect(uploadFile("u-1", bigUpload)).rejects.toThrow(
        "File exceeds the maximum allowed size of 1MB",
      );
    });

    // NOTA DE SYNC (Invariante obligatoria de TESTING_PLAN.md sección 4):
    // La validación de tipos MIME y comodines (ej. "image/*") debe coincidir exactamente
    // con el frontend (ver Fase 14, file-type-extension-aliases.constant.ts y FileTypeMultiSelect).
    it("ALLOWLIST: rechaza si el tipo de archivo no está en la lista permitida", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        ...defaultSettings,
        fileTypeRestrictionMode: FileTypeRestrictionMode.ALLOWLIST,
        fileTypeList: ["application/pdf", "image/*"],
      } as any);

      const textUpload = {
        originalname: "archivo.txt",
        mimetype: "text/plain",
        buffer: Buffer.from("texto"),
        size: 5,
      };

      await expect(uploadFile("u-1", textUpload)).rejects.toThrow(BadRequestError);
      await expect(uploadFile("u-1", textUpload)).rejects.toThrow(
        'File type "text/plain" is not allowed',
      );
    });

    it("ALLOWLIST: permite si coincide con comodín tipo 'image/*'", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        ...defaultSettings,
        fileTypeRestrictionMode: FileTypeRestrictionMode.ALLOWLIST,
        fileTypeList: ["image/*"],
      } as any);

      vi.mocked(FileRepository.createStoredFile).mockResolvedValue(
        buildMockStoredFile({ mimeType: "image/png" }) as any,
      );

      const result = await uploadFile("u-1", validUpload);
      expect(result.mimeType).toBe("image/png");
    });

    it("BLOCKLIST: rechaza si el tipo de archivo está en la lista bloqueada", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        ...defaultSettings,
        fileTypeRestrictionMode: FileTypeRestrictionMode.BLOCKLIST,
        fileTypeList: ["application/x-msdownload", "image/png"],
      } as any);

      await expect(uploadFile("u-1", validUpload)).rejects.toThrow(BadRequestError);
      await expect(uploadFile("u-1", validUpload)).rejects.toThrow(
        'File type "image/png" is blocked',
      );
    });

    it("voice_note: valida que el tipo MIME sea audio/* y la duración máxima", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        ...defaultSettings,
        maxVoiceNoteDurationSeconds: 30,
      } as any);

      // Caso 1: tipo no audio
      const nonAudioVoiceNote = { ...validUpload, mimetype: "video/mp4" };
      await expect(uploadFile("u-1", nonAudioVoiceNote, undefined, "voice_note")).rejects.toThrow(
        'Voice notes must have an "audio/*" mime type',
      );

      // Caso 2: duración mayor a la permitida
      vi.mocked(parseBuffer).mockResolvedValue({
        format: { duration: 45 },
      } as any);
      const audioVoiceNote = {
        originalname: "nota.ogg",
        mimetype: "audio/ogg",
        buffer: Buffer.from("audio"),
        size: 5,
      };

      await expect(uploadFile("u-1", audioVoiceNote, undefined, "voice_note")).rejects.toThrow(
        "Voice note exceeds the maximum allowed duration of 30s",
      );
    });

    it("guarda el archivo en storage y persiste en repository", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(defaultSettings as any);
      vi.mocked(isConversationMember).mockResolvedValue(true);

      const mockSaved = buildMockStoredFile({
        originalName: "reporte.pdf",
        mimeType: "application/pdf",
        extension: "pdf",
      });
      vi.mocked(FileRepository.createStoredFile).mockResolvedValue(mockSaved as any);

      const pdfUpload = {
        originalname: "reporte.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("pdf-data"),
        size: 8,
      };

      const result = await uploadFile("u-1", pdfUpload, "conv-1");

      expect(storage.save).toHaveBeenCalledWith(pdfUpload.buffer, expect.stringContaining("chat/conv-1/"));
      expect(FileRepository.createStoredFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: "reporte.pdf",
          extension: "pdf",
          createdById: "u-1",
        }),
      );
      expect(result.id).toBe(mockSaved.id);
    });
  });

  describe("getFile y getFileChecksum", () => {
    it("getFile devuelve archivo existente", async () => {
      const file = buildMockStoredFile();
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);

      const result = await getFile("file-1");
      expect(result.id).toBe("file-1");
    });

    it("getFile lanza NotFoundError si no existe", async () => {
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(null);

      await expect(getFile("non-existent")).rejects.toThrow(NotFoundError);
      await expect(getFile("non-existent")).rejects.toThrow("File not found");
    });

    it("getFileChecksum devuelve el checksum o null", async () => {
      vi.mocked(FileRepository.findActiveById).mockResolvedValue({ checksum: "abc123hash" } as any);
      expect(await getFileChecksum("file-1")).toBe("abc123hash");

      vi.mocked(FileRepository.findActiveById).mockResolvedValue(null);
      expect(await getFileChecksum("file-missing")).toBeNull();
    });
  });

  describe("storeAvatar", () => {
    it("guarda avatar bajo directorio avatars/{userId} y crea StoredFile", async () => {
      const buffer = Buffer.from("avatar-bytes");
      const mockCreated = buildMockStoredFile({
        originalName: "avatar.png",
        path: "avatars/u-1/avatar.png",
        mimeType: "image/png",
        extension: "png",
      });
      vi.mocked(FileRepository.createStoredFile).mockResolvedValue(mockCreated as any);

      const result = await storeAvatar("u-1", buffer, "image/png");

      expect(storage.save).toHaveBeenCalledWith(buffer, expect.stringContaining("avatars/u-1/"));
      expect(FileRepository.createStoredFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: "avatar.png",
          createdById: "u-1",
          mimeType: "image/png",
        }),
      );
      expect(result.id).toBe("file-1");
    });
  });

  describe("deleteFile", () => {
    it("autor elimina su archivo -> soft delete", async () => {
      const file = buildMockStoredFile({ createdById: "u-owner" });
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);

      const result = await deleteFile("u-owner", "file-1");

      expect(FileRepository.softDelete).toHaveBeenCalledWith("file-1");
      expect(result).toEqual({ id: "file-1" });
    });

    it("rechaza si el usuario que intenta borrar no es el autor", async () => {
      const file = buildMockStoredFile({ createdById: "u-owner" });
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);

      await expect(deleteFile("u-other", "file-1")).rejects.toThrow(ForbiddenError);
      await expect(deleteFile("u-other", "file-1")).rejects.toThrow(
        "Only the uploader can delete this file",
      );
    });

    it("lanza NotFoundError si el archivo no existe", async () => {
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(null);

      await expect(deleteFile("u-owner", "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("listFilesForAdmin", () => {
    it("obtiene filas y agregaciones para el panel de administración", async () => {
      const mockRows = [
        {
          ...buildMockStoredFile(),
          createdBy: { id: "u-1", name: "User 1", email: "u1@test.com" },
          _count: { avatarOfUsers: 1, imageOfConversations: 0, messageFiles: 2 },
        },
      ];
      vi.mocked(FileRepository.listFilesForAdmin).mockResolvedValue(mockRows as any);
      vi.mocked(FileRepository.aggregateFilesForAdmin).mockResolvedValue({
        _count: 1,
        _sum: { size: 2048 },
      } as any);

      const result = await listFilesForAdmin({}, { limit: 10 });

      expect(result.totalCount).toBe(1);
      expect(result.totalSize).toBe(2048);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].usage).toEqual({
        avatarOfUserCount: 1,
        groupImageOfConversationCount: 0,
        messageAttachmentCount: 2,
      });
    });
  });

  describe("adminDeleteFile", () => {
    it("elimina el archivo físico de storage y aplica soft delete en la base", async () => {
      const file = buildMockStoredFile({ path: "chat/file.pdf" });
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);

      const result = await adminDeleteFile("file-1");

      expect(storage.delete).toHaveBeenCalledWith("chat/file.pdf");
      expect(FileRepository.softDelete).toHaveBeenCalledWith("file-1");
      expect(result).toEqual({ id: "file-1" });
    });

    it("si storage.delete falla no interrumpe el soft delete", async () => {
      const originalConsoleError = console.error;
      console.error = vi.fn();

      const file = buildMockStoredFile({ path: "chat/file.pdf" });
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);
      vi.mocked(storage.delete).mockRejectedValue(new Error("Disk IO error"));

      const result = await adminDeleteFile("file-1");

      expect(FileRepository.softDelete).toHaveBeenCalledWith("file-1");
      expect(result).toEqual({ id: "file-1" });

      console.error = originalConsoleError;
    });

    it("lanza NotFoundError si el archivo no existe", async () => {
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(null);

      await expect(adminDeleteFile("nonexistent")).rejects.toThrow(NotFoundError);
    });
  });
});
