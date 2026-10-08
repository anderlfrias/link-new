import { describe, expect, it } from "vitest";
import { PUSH_ENDPOINT_MAX_LENGTH } from "./push-endpoint";
import { subscribeSchema, unsubscribeSchema } from "./push.validator";

const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

describe("push.validator", () => {
  describe("subscribeSchema", () => {
    it("acepta endpoint y claves", async () => {
      const valid = await subscribeSchema.validate({ endpoint, keys: { p256dh: "key-p256", auth: "key-auth" } });

      expect(valid).toEqual({ endpoint, keys: { p256dh: "key-p256", auth: "key-auth" } });
    });

    it("rechaza un body al que le faltan campos", async () => {
      const bodies = [
        {},
        { endpoint },
        { endpoint, keys: {} },
        { endpoint, keys: { p256dh: "key-1" } },
        { keys: { p256dh: "k", auth: "a" } },
      ];

      for (const body of bodies) {
        await expect(subscribeSchema.validate(body)).rejects.toThrow();
      }
    });

    it("rechaza campos que superan el tamaño máximo", async () => {
      const keys = { p256dh: "k", auth: "a" };

      await expect(
        subscribeSchema.validate({ endpoint: "a".repeat(PUSH_ENDPOINT_MAX_LENGTH + 1), keys }),
      ).rejects.toThrow();
      await expect(
        subscribeSchema.validate({ endpoint, keys: { p256dh: "k".repeat(201), auth: "a" } }),
      ).rejects.toThrow();
      await expect(
        subscribeSchema.validate({ endpoint, keys: { p256dh: "k", auth: "a".repeat(101) } }),
      ).rejects.toThrow();
    });
  });

  describe("unsubscribeSchema", () => {
    it("acepta un endpoint", async () => {
      await expect(unsubscribeSchema.validate({ endpoint })).resolves.toEqual({ endpoint });
    });

    it("rechaza un endpoint ausente o demasiado largo", async () => {
      await expect(unsubscribeSchema.validate({})).rejects.toThrow();
      await expect(
        unsubscribeSchema.validate({ endpoint: "a".repeat(PUSH_ENDPOINT_MAX_LENGTH + 1) }),
      ).rejects.toThrow();
    });
  });
});
