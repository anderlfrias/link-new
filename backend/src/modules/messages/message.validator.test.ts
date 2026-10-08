import { describe, expect, it } from "vitest";
import {
  createMessageSchema,
  forwardMessageSchema,
  toggleReactionSchema,
  updateMessageSchema,
  votePollSchema,
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

    it("acepta un mensaje de tipo CONTACT con contenido y sin adjuntos", async () => {
      const contactPayload = JSON.stringify({ id: "u-1", name: "Ana Gomez", email: "ana@test.com" });
      const result = await createMessageSchema.validate({
        content: contactPayload,
        type: "CONTACT",
      });
      expect(result.type).toBe("CONTACT");
      expect(result.content).toBe(contactPayload);
    });

    it("rechaza type CALL (y SYSTEM) enviado por un cliente", async () => {
      // Los registros de llamada los arma el servidor (sendCallRecordMessage).
      await expect(
        createMessageSchema.validate({ content: "📞 Llamada de voz finalizada (00:10)", type: "CALL" }),
      ).rejects.toThrow();
      await expect(createMessageSchema.validate({ content: "algo", type: "SYSTEM" })).rejects.toThrow();
    });

    it("rechaza CONTACT si tiene archivos adjuntos o contenido vacío", async () => {
      await expect(
        createMessageSchema.validate({
          content: JSON.stringify({ id: "u-1" }),
          fileIds: ["file-1"],
          type: "CONTACT",
        }),
      ).rejects.toThrow("a contact message must have content and no files");

      await expect(
        createMessageSchema.validate({
          content: "",
          type: "CONTACT",
        }),
      ).rejects.toThrow();
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

  describe("toggleReactionSchema", () => {
    it("acepta un emoji válido y hace trim", async () => {
      const result = await toggleReactionSchema.validate({ emoji: " 👍 " });
      expect(result.emoji).toBe("👍");
    });

    it("rechaza si emoji está vacío o sólo espacios", async () => {
      await expect(toggleReactionSchema.validate({ emoji: "   " })).rejects.toThrow();
      await expect(toggleReactionSchema.validate({})).rejects.toThrow();
    });

    it("rechaza si el emoji excede 32 caracteres", async () => {
      await expect(toggleReactionSchema.validate({ emoji: "👍".repeat(33) })).rejects.toThrow();
    });
  });

  describe("poll in createMessageSchema", () => {
    it("acepta un mensaje POLL válido con pregunta y opciones", async () => {
      const result = await createMessageSchema.validate({
        type: "POLL",
        poll: {
          question: "¿A qué hora almorzamos?",
          options: ["12:00", "13:00", "14:00"],
          allowMultiple: true,
        },
      });
      expect(result.type).toBe("POLL");
      expect(result.poll?.question).toBe("¿A qué hora almorzamos?");
      expect(result.poll?.options).toEqual(["12:00", "13:00", "14:00"]);
      expect(result.poll?.allowMultiple).toBe(true);
    });

    it("rechaza POLL si tiene menos de 2 opciones", async () => {
      await expect(
        createMessageSchema.validate({
          type: "POLL",
          poll: {
            question: "¿Venís?",
            options: ["Sí"],
          },
        }),
      ).rejects.toThrow("al menos 2 opciones");
    });

    it("rechaza POLL si tiene más de 12 opciones", async () => {
      const options = Array.from({ length: 13 }, (_, i) => `Opción ${i + 1}`);
      await expect(
        createMessageSchema.validate({
          type: "POLL",
          poll: {
            question: "Muchas opciones",
            options,
          },
        }),
      ).rejects.toThrow("máximo 12 opciones");
    });

    it("rechaza POLL con opciones duplicadas", async () => {
      await expect(
        createMessageSchema.validate({
          type: "POLL",
          poll: {
            question: "¿Repetidas?",
            options: ["Opción A", "opción a"],
          },
        }),
      ).rejects.toThrow("Las opciones deben ser distintas");
    });

    it("rechaza POLL con pregunta vacía", async () => {
      await expect(
        createMessageSchema.validate({
          type: "POLL",
          poll: {
            question: "   ",
            options: ["A", "B"],
          },
        }),
      ).rejects.toThrow();
    });

    it("rechaza POLL si contiene archivos adjuntos", async () => {
      await expect(
        createMessageSchema.validate({
          type: "POLL",
          fileIds: ["file-1"],
          poll: {
            question: "¿Con archivo?",
            options: ["A", "B"],
          },
        }),
      ).rejects.toThrow("a poll message must have poll payload and no files");
    });
  });

  describe("votePollSchema", () => {
    it("acepta optionId válido", async () => {
      const result = await votePollSchema.validate({ optionId: "opt-123" });
      expect(result.optionId).toBe("opt-123");
    });

    it("rechaza si falta optionId o es vacío", async () => {
      await expect(votePollSchema.validate({})).rejects.toThrow();
      await expect(votePollSchema.validate({ optionId: "   " })).rejects.toThrow();
    });
  });
});
