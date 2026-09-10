import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend, mockGetSignedUrl } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation(function (this: any) {
      this.send = mockSend;
      return this;
    }),
    PutObjectCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "PutObject";
      return this;
    }),
    DeleteObjectCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "DeleteObject";
      return this;
    }),
    HeadObjectCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "HeadObject";
      return this;
    }),
    GetObjectCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "GetObject";
      return this;
    }),
    CreateMultipartUploadCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "CreateMultipartUpload";
      return this;
    }),
    UploadPartCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "UploadPart";
      return this;
    }),
    ListPartsCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "ListParts";
      return this;
    }),
    CompleteMultipartUploadCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "CompleteMultipartUpload";
      return this;
    }),
    AbortMultipartUploadCommand: vi.fn().mockImplementation(function (this: any, args: any) {
      Object.assign(this, args);
      this.type = "AbortMultipartUpload";
      return this;
    }),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock("../config/env", () => ({
  default: {
    S3_ENDPOINT: "http://seaweedfs:8333",
    S3_REGION: "us-east-1",
    S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
    S3_FORCE_PATH_STYLE: true,
  },
}));

import { S3Storage } from "./s3.storage";

describe("S3Storage", () => {
  let storage: S3Storage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new S3Storage();
  });

  describe("save", () => {
    it("envía PutObjectCommand con bucket, key normalizada y buffer", async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from("contenido de prueba");

      const result = await storage.save(buffer, "chat\\2026\\09\\file.pdf");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "PutObject",
          Bucket: "test-bucket",
          Key: "chat/2026/09/file.pdf",
          Body: buffer,
        }),
      );
      expect(result).toEqual({
        path: "chat/2026/09/file.pdf",
        size: buffer.length,
      });
    });
  });

  describe("delete", () => {
    it("envía DeleteObjectCommand con bucket y key normalizada", async () => {
      mockSend.mockResolvedValue({});

      await storage.delete("/avatars/u-1/foto.png");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "DeleteObject",
          Bucket: "test-bucket",
          Key: "avatars/u-1/foto.png",
        }),
      );
    });
  });

  describe("stat", () => {
    it("envía HeadObjectCommand y devuelve ContentLength como size", async () => {
      mockSend.mockResolvedValue({ ContentLength: 4096 });

      const stats = await storage.stat("docs/manual.pdf");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "HeadObject",
          Bucket: "test-bucket",
          Key: "docs/manual.pdf",
        }),
      );
      expect(stats.size).toBe(4096);
    });

    it("devuelve 0 si ContentLength es undefined", async () => {
      mockSend.mockResolvedValue({});

      const stats = await storage.stat("docs/empty.pdf");
      expect(stats.size).toBe(0);
    });
  });

  describe("createReadStream", () => {
    it("envía GetObjectCommand sin Range si no se pasan opciones", async () => {
      const mockStream = new Readable();
      mockSend.mockResolvedValue({ Body: mockStream });

      const stream = await storage.createReadStream("audio/nota.webm");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "GetObject",
          Bucket: "test-bucket",
          Key: "audio/nota.webm",
          Range: undefined,
        }),
      );
      expect(stream).toBe(mockStream);
    });

    it("envía GetObjectCommand con Range cuando se especifican start y end", async () => {
      const mockStream = new Readable();
      mockSend.mockResolvedValue({ Body: mockStream });

      await storage.createReadStream("video/clip.mp4", { start: 100, end: 500 });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "GetObject",
          Bucket: "test-bucket",
          Key: "video/clip.mp4",
          Range: "bytes=100-500",
        }),
      );
    });
  });

  describe("getPresignedDownloadUrl", () => {
    it("llama a getSignedUrl con parámetros de respuesta y TTL de 300s por defecto", async () => {
      mockGetSignedUrl.mockResolvedValue("https://s3.example.com/test-bucket/doc.pdf?signature=xyz");

      const url = await storage.getPresignedDownloadUrl(
        "doc.pdf",
        300,
        'attachment; filename="doc.pdf"',
        "application/pdf",
      );

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "GetObject",
          Bucket: "test-bucket",
          Key: "doc.pdf",
          ResponseContentDisposition: 'attachment; filename="doc.pdf"',
          ResponseContentType: "application/pdf",
        }),
        { expiresIn: 300 },
      );
      expect(url).toBe("https://s3.example.com/test-bucket/doc.pdf?signature=xyz");
    });
  });

  describe("getPublicUrl", () => {
    it("devuelve la ruta relativa canónica de la API", () => {
      expect(storage.getPublicUrl("chat/archivo.png")).toBe("/api/v1/files/chat/archivo.png");
    });
  });

  describe("createMultipartUpload", () => {
    it("envía CreateMultipartUploadCommand y retorna el UploadId asignado", async () => {
      mockSend.mockResolvedValue({ UploadId: "upload-abc-123" });

      const uploadId = await storage.createMultipartUpload("chat/2026/09/large.mp4", "video/mp4");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CreateMultipartUpload",
          Bucket: "test-bucket",
          Key: "chat/2026/09/large.mp4",
          ContentType: "video/mp4",
        }),
      );
      expect(uploadId).toBe("upload-abc-123");
    });

    it("lanza un error si el storage no devuelve UploadId", async () => {
      mockSend.mockResolvedValue({});

      await expect(
        storage.createMultipartUpload("chat/large.mp4", "video/mp4"),
      ).rejects.toThrow("Failed to create multipart upload");
    });
  });

  describe("getPresignedPartUploadUrl", () => {
    it("genera URL presignada con UploadPartCommand, número de parte y TTL", async () => {
      mockGetSignedUrl.mockResolvedValue("https://s3.example.com/part-1-signed-url");

      const url = await storage.getPresignedPartUploadUrl(
        "chat/large.mp4",
        "upload-abc-123",
        1,
        900,
      );

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "UploadPart",
          Bucket: "test-bucket",
          Key: "chat/large.mp4",
          UploadId: "upload-abc-123",
          PartNumber: 1,
        }),
        { expiresIn: 900 },
      );
      expect(url).toBe("https://s3.example.com/part-1-signed-url");
    });
  });

  describe("listParts", () => {
    it("obtiene la lista autoritativa de partes soportando paginación", async () => {
      mockSend
        .mockResolvedValueOnce({
          IsTruncated: true,
          NextPartNumberMarker: 2,
          Parts: [
            { PartNumber: 1, Size: 8388608, ETag: '"etag-1"' },
            { PartNumber: 2, Size: 8388608, ETag: '"etag-2"' },
          ],
        })
        .mockResolvedValueOnce({
          IsTruncated: false,
          Parts: [{ PartNumber: 3, Size: 4194304, ETag: '"etag-3"' }],
        });

      const parts = await storage.listParts("chat/large.mp4", "upload-abc-123");

      expect(parts).toEqual([
        { partNumber: 1, size: 8388608, eTag: '"etag-1"' },
        { partNumber: 2, size: 8388608, eTag: '"etag-2"' },
        { partNumber: 3, size: 4194304, eTag: '"etag-3"' },
      ]);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("completeMultipartUpload", () => {
    it("envía CompleteMultipartUploadCommand con las partes y ETags", async () => {
      mockSend.mockResolvedValue({});

      await storage.completeMultipartUpload("chat/large.mp4", "upload-abc-123", [
        { partNumber: 1, eTag: '"etag-1"' },
        { partNumber: 2, eTag: '"etag-2"' },
      ]);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CompleteMultipartUpload",
          Bucket: "test-bucket",
          Key: "chat/large.mp4",
          UploadId: "upload-abc-123",
          MultipartUpload: {
            Parts: [
              { PartNumber: 1, ETag: '"etag-1"' },
              { PartNumber: 2, ETag: '"etag-2"' },
            ],
          },
        }),
      );
    });
  });

  describe("abortMultipartUpload", () => {
    it("envía AbortMultipartUploadCommand con bucket, key y uploadId", async () => {
      mockSend.mockResolvedValue({});

      await storage.abortMultipartUpload("chat/large.mp4", "upload-abc-123");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "AbortMultipartUpload",
          Bucket: "test-bucket",
          Key: "chat/large.mp4",
          UploadId: "upload-abc-123",
        }),
      );
    });
  });
});
