import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";

vi.mock("./file.service", () => ({
  uploadFile: vi.fn(),
  getFile: vi.fn(),
  deleteFile: vi.fn(),
  listFilesForAdmin: vi.fn(),
  adminDeleteFile: vi.fn(),
}));

import * as FileService from "./file.service";
import { deleteAdmin, getById, listAdmin, remove, upload } from "./file.controller";

describe("file.controller", () => {
  const mockUser = {
    internalUserId: "u-internal-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upload", () => {
    it("sube archivo exitosamente y responde 201", async () => {
      const mockMulterFile = {
        originalname: "foto.png",
        mimetype: "image/png",
        buffer: Buffer.from("data"),
        size: 4,
      };
      const req = createMockRequest({
        user: mockUser as any,
        file: mockMulterFile as any,
        body: { conversationId: "conv-1", kind: "file" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockStoredResponse = { id: "f-1", originalName: "foto.png" };
      vi.mocked(FileService.uploadFile).mockResolvedValue(mockStoredResponse as any);

      await upload(req, res, next);

      expect(FileService.uploadFile).toHaveBeenCalledWith(
        "u-internal-1",
        mockMulterFile,
        "conv-1",
        "file",
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockStoredResponse);
      expect(next).not.toHaveBeenCalled();
    });

    it("lanza BadRequestError si falta el archivo en req.file", async () => {
      const req = createMockRequest({ user: mockUser as any, file: undefined });
      const res = createMockResponse();
      const next = createMockNext();

      await upload(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestError);
      expect(err.message).toContain('Missing file (expected multipart/form-data field "file")');
    });
  });

  describe("getById", () => {
    it("responde con el archivo solicitado", async () => {
      const req = createMockRequest({ params: { id: "f-1" } });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(FileService.getFile).mockResolvedValue({ id: "f-1" } as any);

      await getById(req, res, next);

      expect(FileService.getFile).toHaveBeenCalledWith("f-1");
      expect(res.json).toHaveBeenCalledWith({ id: "f-1" });
    });
  });

  describe("remove", () => {
    it("elimina el archivo del usuario", async () => {
      const req = createMockRequest({ user: mockUser as any, params: { id: "f-1" } });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(FileService.deleteFile).mockResolvedValue({ id: "f-1" });

      await remove(req, res, next);

      expect(FileService.deleteFile).toHaveBeenCalledWith("u-internal-1", "f-1");
      expect(res.json).toHaveBeenCalledWith({ id: "f-1" });
    });
  });

  describe("listAdmin", () => {
    it("parsea filtros de administración y responde con la lista", async () => {
      const req = createMockRequest({
        query: {
          type: "image",
          uploader: "  juan  ",
          search: "avatar",
          from: "2026-01-01T00:00:00Z",
          to: "2026-01-31T23:59:59Z",
          limit: "25",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(FileService.listFilesForAdmin).mockResolvedValue({
        files: [],
        totalCount: 0,
        totalSize: 0,
      });

      await listAdmin(req, res, next);

      expect(FileService.listFilesForAdmin).toHaveBeenCalledWith(
        {
          type: "image",
          uploader: "juan",
          search: "avatar",
          from: new Date("2026-01-01T00:00:00Z"),
          to: new Date("2026-01-31T23:59:59Z"),
        },
        {
          beforeId: undefined,
          limit: 25,
        },
      );
      expect(res.json).toHaveBeenCalledWith({ files: [], totalCount: 0, totalSize: 0 });
    });

    it("pasa BadRequestError a next si la fecha from es inválida", async () => {
      const req = createMockRequest({ query: { from: "fecha-invalida" } });
      const res = createMockResponse();
      const next = createMockNext();

      await listAdmin(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestError);
      expect(err.message).toBe('Invalid "from" date');
    });
  });

  describe("deleteAdmin", () => {
    it("llama a adminDeleteFile y responde el resultado", async () => {
      const req = createMockRequest({ params: { id: "f-1" } });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(FileService.adminDeleteFile).mockResolvedValue({ id: "f-1" });

      await deleteAdmin(req, res, next);

      expect(FileService.adminDeleteFile).toHaveBeenCalledWith("f-1");
      expect(res.json).toHaveBeenCalledWith({ id: "f-1" });
    });
  });
});
