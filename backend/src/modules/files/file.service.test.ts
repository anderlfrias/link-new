import { FileTypeRestrictionMode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config/logger";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";

const { mockStorage } = vi.hoisted(() => {
  const mockStorage = {
    save: vi.fn((buf: Buffer, relPath: string) => Promise.resolve({ path: relPath, size: buf.length })),
    delete: vi.fn(() => Promise.resolve()),
    getPublicUrl: vi.fn((p: string) => `/uploads/${p}`),
    createReadStream: vi.fn(),
    stat: vi.fn(),
  };
  return { mockStorage };
});

vi.mock("../../storage", () => ({
  storage: mockStorage,
  getProvider: vi.fn(() => mockStorage),
  getWriteProvider: vi.fn(() => ({ provider: "LOCAL", storage: mockStorage })),
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
  buildContentDisposition,
  canAccessFile,
  deleteFile,
  generateFileToken,
  getFile,
  getFileChecksum,
  getFileStorageStats,
  listFilesForAdmin,
  storeAvatar,
  toStoredFileResponse,
  uploadFile,
  verifyFileToken,
} from "./file.service";

function buildMockStoredFile(overrides: any = {}) {
  return {
    id: "file-1",
    originalName: "documento.pdf",
    storedName: "stored-uuid.pdf",
    path: "chat/conv-1/2026/03/stored-uuid.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    size: 2048n,
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
    it("convierte StoredFile a StoredFileResponse generando url firmada", () => {
      const file = buildMockStoredFile();
      const response = toStoredFileResponse(file as any, "u-user");

      expect(response).toEqual({
        id: "file-1",
        originalName: "documento.pdf",
        mimeType: "application/pdf",
        extension: "pdf",
        size: 2048,
        url: expect.stringMatching(/^\/api\/v1\/files\/file-1\/content\?t=.+/),
        createdAt: file.createdAt,
        deletedAt: null,
      });

      const token = response.url.split("t=")[1];
      const verified = verifyFileToken("file-1", token);
      expect(verified.userId).toBe("u-user");
    });

    // LARGE_FILES_PLAN.md §5.1/§13 (Riesgo 3): StoredFile.size es bigint en
    // Prisma desde la migración a soportar archivos >= 2 GiB — un size que
    // desbordaría el int4 anterior (max ~2.147 GB) debe serializar como
    // number (JSON) sin explotar ni perder precisión.
    it("serializa un size de 3 GiB (bigint) a number sin desbordar ni explotar", () => {
      const threeGib = 3n * 1024n ** 3n;
      const file = buildMockStoredFile({ size: threeGib });

      const response = toStoredFileResponse(file as any);

      expect(response.size).toBe(Number(threeGib));
      expect(() => JSON.stringify(response)).not.toThrow();
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
          // FileRepository.createStoredFile espera bigint (StoredFile.size
          // en Prisma) — uploadFile debe convertir el number de storage.save().
          size: BigInt(pdfUpload.buffer.length),
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

    it("getFile verifica autorización del usuario (S11)", async () => {
      const file = buildMockStoredFile();
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);
      vi.mocked(FileRepository.checkUserFileAccess).mockResolvedValue(false);

      await expect(getFile("file-1", "unauthorized-user")).rejects.toThrow(ForbiddenError);
      await expect(getFile("file-1", "unauthorized-user")).rejects.toThrow("You do not have access to this file");

      vi.mocked(FileRepository.checkUserFileAccess).mockResolvedValue(true);
      const authorized = await getFile("file-1", "authorized-user");
      expect(authorized.id).toBe("file-1");

      // Admin siempre tiene acceso
      vi.mocked(FileRepository.checkUserFileAccess).mockResolvedValue(false);
      const adminResult = await getFile("file-1", "admin-user", ["admin"]);
      expect(adminResult.id).toBe("file-1");
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

  describe("HMAC tokens y acceso a archivos", () => {
    it("genera y verifica tokens HMAC correctamente", () => {
      const token = generateFileToken("file-123", "user-abc", 3600);
      const verified = verifyFileToken("file-123", token);
      expect(verified.userId).toBe("user-abc");
    });

    it("falla verificación si el token expiró", () => {
      const expiredToken = generateFileToken("file-123", "user-abc", -10);
      expect(() => verifyFileToken("file-123", expiredToken)).toThrow("Token expired");
    });

    it("falla verificación si fileId no coincide con la firma", () => {
      const token = generateFileToken("file-123", "user-abc", 3600);
      expect(() => verifyFileToken("different-file", token)).toThrow("Invalid token signature");
    });

    it("falla verificación si el token tiene formato inválido o payload corrupto", () => {
      expect(() => verifyFileToken("file-123", "invalid-token")).toThrow("Invalid token format");
      expect(() => verifyFileToken("file-123", "badpayload.badsig")).toThrow("Invalid token payload");
    });

    it("canAccessFile permite a admin inmediatamente y consulta repositorio para otros", async () => {
      const adminAccess = await canAccessFile("u-admin", "f-1", ["admin"]);
      expect(adminAccess).toBe(true);
      expect(FileRepository.checkUserFileAccess).not.toHaveBeenCalled();

      vi.mocked(FileRepository.checkUserFileAccess).mockResolvedValueOnce(true);
      const userAccess = await canAccessFile("u-normal", "f-1", []);
      expect(userAccess).toBe(true);
      expect(FileRepository.checkUserFileAccess).toHaveBeenCalledWith("u-normal", "f-1");
    });
  });

  describe("buildContentDisposition (S6 y S7)", () => {
    it("asigna inline para imágenes seguras, audio y video mp4", () => {
      expect(buildContentDisposition("foto.png", "image/png")).toContain("inline;");
      expect(buildContentDisposition("foto.jpg", "image/jpeg")).toContain("inline;");
      expect(buildContentDisposition("anim.gif", "image/gif")).toContain("inline;");
      expect(buildContentDisposition("audio.ogg", "audio/ogg")).toContain("inline;");
      expect(buildContentDisposition("clip.mp4", "video/mp4")).toContain("inline;");
    });

    it("asigna attachment a SVG para mitigar XSS almacenado (S6)", () => {
      const cd = buildContentDisposition("vector.svg", "image/svg+xml");
      expect(cd).toContain("attachment;");
    });

    it("asigna attachment a PDFs, binarios o cuando forceDownload es true", () => {
      expect(buildContentDisposition("doc.pdf", "application/pdf")).toContain("attachment;");
      expect(buildContentDisposition("foto.png", "image/png", true)).toContain("attachment;");
    });

    it("sanitiza caracteres de control, comillas y CRLF en el nombre ASCII (S7)", () => {
      const hostileName = 'foto"maliciosa\r\n;test.png';
      const cd = buildContentDisposition(hostileName, "image/png");
      expect(cd).not.toContain("\r");
      expect(cd).not.toContain("\n");
      expect(cd).toContain('filename="foto_maliciosa___test.png"');
      expect(cd).toContain("filename*=UTF-8''foto%22maliciosa%0D%0A%3Btest.png");
    });

    it("codifica nombres con acentos y caracteres especiales según RFC 5987", () => {
      const cd = buildContentDisposition("informe médico año 2026.pdf", "application/pdf");
      expect(cd).toContain("filename*=UTF-8''informe%20m%C3%A9dico%20a%C3%B1o%202026.pdf");
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
          size: BigInt(buffer.length),
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
        _sum: { size: 2048n },
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
      expect(result.files[0].provider).toBe("LOCAL");
    });

    // LARGE_FILES_PLAN.md §5.1: _sum.size vuelve bigint | null con la
    // migración — el punto de la Fase 1 "más fácil de olvidar" (ver §13,
    // Riesgo 3): sin Number(...), JSON.stringify explota al responder.
    it("serializa totalSize sin explotar cuando el agregado supera 2^31 bytes", async () => {
      vi.mocked(FileRepository.listFilesForAdmin).mockResolvedValue([]);
      const bigTotal = 5n * 1024n ** 3n; // 5 GiB
      vi.mocked(FileRepository.aggregateFilesForAdmin).mockResolvedValue({
        _count: 2,
        _sum: { size: bigTotal },
      } as any);

      const result = await listFilesForAdmin({}, { limit: 10 });

      expect(result.totalSize).toBe(Number(bigTotal));
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it("totalSize es 0 cuando el agregado no tiene archivos (_sum.size null)", async () => {
      vi.mocked(FileRepository.listFilesForAdmin).mockResolvedValue([]);
      vi.mocked(FileRepository.aggregateFilesForAdmin).mockResolvedValue({
        _count: 0,
        _sum: { size: null },
      } as any);

      const result = await listFilesForAdmin({}, { limit: 10 });

      expect(result.totalSize).toBe(0);
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

    it("si storage.delete falla no interrumpe el soft delete y loguea error", async () => {
      const errorSpy = vi.spyOn(logger, "error");

      const file = buildMockStoredFile({ path: "chat/file.pdf" });
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(file as any);
      vi.mocked(storage.delete).mockRejectedValue(new Error("Disk IO error"));

      const result = await adminDeleteFile("file-1");

      expect(FileRepository.softDelete).toHaveBeenCalledWith("file-1");
      expect(result).toEqual({ id: "file-1" });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: "file-1", err: expect.any(Error) }),
        "failed to delete physical file",
      );
    });

    it("lanza NotFoundError si el archivo no existe", async () => {
      vi.mocked(FileRepository.findActiveById).mockResolvedValue(null);

      await expect(adminDeleteFile("nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("getFileStorageStats", () => {
    it("devuelve los conteos por provider y la configuración del worker", async () => {
      vi.mocked(FileRepository.countFilesByProvider).mockResolvedValue({
        local: 42,
        s3: 158,
        total: 200,
      });
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        fileMigrationEnabled: true,
        fileMigrationBatchSize: 25,
        fileMigrationIntervalMinutes: 15,
      } as any);

      const stats = await getFileStorageStats();

      expect(stats).toEqual({
        localCount: 42,
        s3Count: 158,
        totalCount: 200,
        migrationEnabled: true,
        migrationBatchSize: 25,
        migrationIntervalMinutes: 15,
      });
    });
  });

  describe("buildContentDisposition", () => {
    it("permite inline para tipos seguros de la allowlist (png, jpeg, gif, webp, audio, video/mp4)", () => {
      expect(buildContentDisposition("foto.png", "image/png")).toContain("inline;");
      expect(buildContentDisposition("foto.jpg", "image/jpeg")).toContain("inline;");
      expect(buildContentDisposition("anim.gif", "image/gif")).toContain("inline;");
      expect(buildContentDisposition("foto.webp", "image/webp")).toContain("inline;");
      expect(buildContentDisposition("nota.mp3", "audio/mpeg")).toContain("inline;");
      expect(buildContentDisposition("clip.mp4", "video/mp4")).toContain("inline;");
    });

    it("fuerza attachment para SVG y HTML mitigando riesgo de XSS almacenado (§9.1 S6)", () => {
      const svgDisposition = buildContentDisposition("vector.svg", "image/svg+xml");
      expect(svgDisposition).toContain("attachment;");
      expect(svgDisposition).not.toContain("inline;");

      const htmlDisposition = buildContentDisposition("malicious.html", "text/html");
      expect(htmlDisposition).toContain("attachment;");
      expect(htmlDisposition).not.toContain("inline;");
    });

    it("fuerza attachment para otros tipos arbitrarios como PDF y ejecutables", () => {
      expect(buildContentDisposition("doc.pdf", "application/pdf")).toContain("attachment;");
      expect(buildContentDisposition("app.exe", "application/octet-stream")).toContain("attachment;");
    });

    it("fuerza attachment si forceDownload es true independientemente del mimeType", () => {
      const disposition = buildContentDisposition("foto.png", "image/png", true);
      expect(disposition).toContain("attachment;");
      expect(disposition).not.toContain("inline;");
    });

    it("sanitiza caracteres de control y CRLF para evitar inyección de cabeceras (§9.1 S7)", () => {
      const disposition = buildContentDisposition("malicious\r\nSet-Cookie: session=evil\r\n.pdf", "application/pdf");
      expect(disposition).not.toContain("\r");
      expect(disposition).not.toContain("\n");
      expect(disposition).toContain("attachment;");
    });

    it("sanitiza comillas dobles, punto y coma y barras en el nombre ASCII", () => {
      const disposition = buildContentDisposition('archivo"; "hack.pdf', "application/pdf");
      expect(disposition).toContain('filename="archivo__ _hack.pdf"');
    });

    it("aplica fallback seguro cuando el nombre está vacío o sólo contiene caracteres no imprimibles", () => {
      const emptyDisposition = buildContentDisposition("", "application/pdf");
      expect(emptyDisposition).toContain('filename="archivo"');

      const ctrlDisposition = buildContentDisposition("\x00\x01\x1f", "application/pdf");
      expect(ctrlDisposition).toContain('filename="archivo"');
    });

    it("codifica nombres UTF-8 con acentos, paréntesis y emojis según RFC 5987", () => {
      const disposition = buildContentDisposition("informe médico (2026) 📄.pdf", "application/pdf");
      expect(disposition).toContain("filename*=UTF-8''");
      expect(disposition).toContain("%20");
      expect(disposition).toContain("%282026%29");
      expect(disposition).toContain("%F0%9F%93%84");
    });
  });
});
