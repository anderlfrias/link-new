import { describe, expect, it } from "vitest";
import {
  completeUploadSchema,
  getPartUrlsSchema,
  initiateUploadSchema,
} from "./upload.validator";

describe("upload.validator", () => {
  describe("initiateUploadSchema", () => {
    it("valida un payload correcto de inicio de subida", async () => {
      const valid = {
        name: "video.mp4",
        size: 50 * 1024 * 1024,
        mimeType: "video/mp4",
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = await initiateUploadSchema.validate(valid);
      expect(result.name).toBe("video.mp4");
      expect(result.size).toBe(52428800);
      expect(result.mimeType).toBe("video/mp4");
      expect(result.conversationId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("permite omitir conversationId", async () => {
      const valid = {
        name: "document.pdf",
        size: 20 * 1024 * 1024,
        mimeType: "application/pdf",
      };

      const result = await initiateUploadSchema.validate(valid);
      expect(result.conversationId).toBeUndefined();
    });

    it("falla si falta el nombre o está vacío", async () => {
      await expect(
        initiateUploadSchema.validate({
          name: "   ",
          size: 1000,
          mimeType: "application/pdf",
        }),
      ).rejects.toThrow();
    });

    it("falla si el tamaño es 0, negativo o no es entero", async () => {
      await expect(
        initiateUploadSchema.validate({
          name: "test.bin",
          size: 0,
          mimeType: "application/octet-stream",
        }),
      ).rejects.toThrow();

      await expect(
        initiateUploadSchema.validate({
          name: "test.bin",
          size: -10,
          mimeType: "application/octet-stream",
        }),
      ).rejects.toThrow();

      await expect(
        initiateUploadSchema.validate({
          name: "test.bin",
          size: 10.5,
          mimeType: "application/octet-stream",
        }),
      ).rejects.toThrow();
    });

    it("falla si el mimeType tiene formato inválido", async () => {
      await expect(
        initiateUploadSchema.validate({
          name: "test.pdf",
          size: 1000,
          mimeType: ".pdf",
        }),
      ).rejects.toThrow();

      await expect(
        initiateUploadSchema.validate({
          name: "test.pdf",
          size: 1000,
          mimeType: "invalid-mime",
        }),
      ).rejects.toThrow();
    });

    it("falla si conversationId no es un UUID válido", async () => {
      await expect(
        initiateUploadSchema.validate({
          name: "test.pdf",
          size: 1000,
          mimeType: "application/pdf",
          conversationId: "not-a-uuid",
        }),
      ).rejects.toThrow();
    });
  });

  describe("getPartUrlsSchema", () => {
    it("valida un lote de partes correcto", async () => {
      const valid = { partNumbers: [1, 2, 3, 4] };
      const result = await getPartUrlsSchema.validate(valid);
      expect(result.partNumbers).toEqual([1, 2, 3, 4]);
    });

    it("falla si partNumbers está vacío", async () => {
      await expect(getPartUrlsSchema.validate({ partNumbers: [] })).rejects.toThrow();
    });

    it("falla si excede el máximo permitido de 20 partes por lote", async () => {
      const numbers = Array.from({ length: 21 }, (_, i) => i + 1);
      await expect(getPartUrlsSchema.validate({ partNumbers: numbers })).rejects.toThrow(
        "Cannot request more than 20 part URLs per batch",
      );
    });

    it("falla si contiene números de parte duplicados", async () => {
      await expect(
        getPartUrlsSchema.validate({ partNumbers: [1, 2, 2, 3] }),
      ).rejects.toThrow("Duplicate part numbers are not allowed");
    });

    it("falla si contiene números de parte menores a 1 o no enteros", async () => {
      await expect(
        getPartUrlsSchema.validate({ partNumbers: [0, 1] }),
      ).rejects.toThrow();

      await expect(
        getPartUrlsSchema.validate({ partNumbers: [1.5, 2] }),
      ).rejects.toThrow();
    });
  });

  describe("completeUploadSchema", () => {
    it("permite un checksum válido o vacío", async () => {
      const res1 = await completeUploadSchema.validate({ checksum: "abc123sha" });
      expect(res1.checksum).toBe("abc123sha");

      const res2 = await completeUploadSchema.validate({});
      expect(res2.checksum).toBeUndefined();
    });
  });
});
