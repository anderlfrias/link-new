import { describe, expect, it } from "vitest";
import {
  createMessageSchema,
  forwardMessageSchema,
  updateMessageSchema,
} from "./message.validator";

describe("message.validator", () => {
  describe("createMessageSchema", () => {
    it("acepta mensaje con solo texto", async () => {
      const result = await createMessageSchema.validate({
        content: "Hola mundo",
      });
      expect(result.content).toBe("Hola mundo");
    });

    it("acepta mensaje con solo adjunto (sin texto)", async () => {
      const result = await createMessageSchema.validate({
        fileIds: ["file-1"],
      });
      expect(result.fileIds).toEqual(["file-1"]);
      expect(result.content).toBe("");
    });

    it("acepta mensaje con texto, adjuntos y replyToId", async () => {
      const result = await createMessageSchema.validate({
        content: "Respondiendo...",
        fileIds: ["file-1"],
        replyToId: "msg-orig-1",
      });
      expect(result.content).toBe("Respondiendo...");
      expect(result.replyToId).toBe("msg-orig-1");
    });

    it("acepta STICKER si el contenido está vacío y tiene exactamente un fileId", async () => {
      const result = await createMessageSchema.validate({
        content: "",
        fileIds: ["sticker-file-1"],
        type: "STICKER",
      });
      expect(result.type).toBe("STICKER");
      expect(result.fileIds).toHaveLength(1);
    });

    it("rechaza STICKER si tiene contenido de texto o más de un fileId", async () => {
      await expect(
        createMessageSchema.validate({
          content: "Texto con sticker no permitido",
          fileIds: ["sticker-file-1"],
          type: "STICKER",
        }),
      ).rejects.toThrow("a sticker message must have empty content and exactly one fileId");

      await expect(
        createMessageSchema.validate({
          content: "",
          fileIds: ["file-1", "file-2"],
          type: "STICKER",
        }),
      ).rejects.toThrow("a sticker message must have empty content and exactly one fileId");
    });

    it("rechaza si no tiene ni texto ni adjuntos", async () => {
      await expect(createMessageSchema.validate({})).rejects.toThrow(
        "content or fileIds is required",
      );
      await expect(createMessageSchema.validate({ content: "   ", fileIds: [] })).rejects.toThrow(
        "content or fileIds is required",
      );
    });

    it("rechaza si el contenido excede 4000 caracteres", async () => {
      const longText = "a".repeat(4001);
      await expect(createMessageSchema.validate({ content: longText })).rejects.toThrow();
    });
  });

  describe("updateMessageSchema", () => {
    it("acepta texto válido y aplica trim", async () => {
      const result = await updateMessageSchema.validate({ content: "  Texto editado  " });
      expect(result.content).toBe("Texto editado");
    });

    it("rechaza texto vacío o solo espacios", async () => {
      await expect(updateMessageSchema.validate({ content: "   " })).rejects.toThrow();
    });

    it("rechaza si excede 4000 caracteres", async () => {
      await expect(
        updateMessageSchema.validate({ content: "a".repeat(4001) }),
      ).rejects.toThrow();
    });
  });

  describe("forwardMessageSchema", () => {
    it("acepta un messageId válido", async () => {
      const result = await forwardMessageSchema.validate({ messageId: "msg-123" });
      expect(result.messageId).toBe("msg-123");
    });

    it("rechaza si falta messageId", async () => {
      await expect(forwardMessageSchema.validate({})).rejects.toThrow();
    });
  });
});
