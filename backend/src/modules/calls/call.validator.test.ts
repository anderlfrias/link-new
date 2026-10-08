import { describe, expect, it } from "vitest";
import {
  MAX_SIGNAL_BYTES,
  acceptCallSchema,
  endCallSchema,
  initiateCallSchema,
  rejectCallSchema,
  signalSchema,
} from "./call.validator";

describe("call.validator", () => {
  describe("initiateCallSchema", () => {
    it("valida payload correcto con tipo AUDIO o VIDEO", async () => {
      const valid = await initiateCallSchema.validate({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        type: "VIDEO",
      });
      expect(valid.type).toBe("VIDEO");
      expect(valid.conversationId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("asigna AUDIO por defecto si no se especifica", async () => {
      const valid = await initiateCallSchema.validate({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      });
      expect(valid.type).toBe("AUDIO");
    });

    it("falla si faltan campos obligatorios o el UUID es inválido", async () => {
      await expect(
        initiateCallSchema.validate({
          conversationId: "invalido",
          receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        }),
      ).rejects.toThrow();

      await expect(
        initiateCallSchema.validate({
          conversationId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      ).rejects.toThrow();
    });
  });

  describe("acceptCallSchema", () => {
    it("valida callId correcto", async () => {
      const valid = await acceptCallSchema.validate({
        callId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(valid.callId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("rechaza callId no uuid", async () => {
      await expect(acceptCallSchema.validate({ callId: "123" })).rejects.toThrow();
    });
  });

  describe("rejectCallSchema", () => {
    it("valida razón opcional (declined o busy)", async () => {
      const valid1 = await rejectCallSchema.validate({
        callId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(valid1.reason).toBe("declined");

      const valid2 = await rejectCallSchema.validate({
        callId: "550e8400-e29b-41d4-a716-446655440000",
        reason: "busy",
      });
      expect(valid2.reason).toBe("busy");
    });

    it("rechaza razón no válida", async () => {
      await expect(
        rejectCallSchema.validate({
          callId: "550e8400-e29b-41d4-a716-446655440000",
          reason: "no_me_gusta",
        }),
      ).rejects.toThrow();
    });
  });

  describe("signalSchema", () => {
    it("valida signal con targetUserId y callId válidos", async () => {
      const valid = await signalSchema.validate({
        callId: "550e8400-e29b-41d4-a716-446655440000",
        targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        signal: { type: "offer", sdp: "v=0..." },
      });
      expect(valid.targetUserId).toBe("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
      expect(valid.signal).toBeDefined();
    });

    it("falla si falta signal", async () => {
      await expect(
        signalSchema.validate({
          callId: "550e8400-e29b-41d4-a716-446655440000",
          targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        }),
      ).rejects.toThrow();
    });

    it("acepta una señal de hasta 64 KiB y rechaza una más grande", async () => {
      const base = {
        callId: "550e8400-e29b-41d4-a716-446655440000",
        targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      };
      // {"sdp":"..."} suma 10 caracteres de estructura alrededor del texto.
      const fits = { sdp: "a".repeat(MAX_SIGNAL_BYTES - 10) };
      const tooBig = { sdp: "a".repeat(MAX_SIGNAL_BYTES - 9) };

      await expect(signalSchema.validate({ ...base, signal: fits })).resolves.toBeDefined();
      await expect(signalSchema.validate({ ...base, signal: tooBig })).rejects.toThrow(
        "Señal WebRTC demasiado grande",
      );
    });

    it("rechaza una señal que no se puede serializar", async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      await expect(
        signalSchema.validate({
          callId: "550e8400-e29b-41d4-a716-446655440000",
          targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          signal: circular,
        }),
      ).rejects.toThrow("Señal WebRTC demasiado grande");
    });
  });

  describe("endCallSchema", () => {
    it("valida endCall con UUID válido", async () => {
      const valid = await endCallSchema.validate({
        callId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(valid.callId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });
  });
});
