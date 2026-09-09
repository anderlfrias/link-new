import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";
import * as PushController from "./push.controller";
import * as PushService from "./push.service";

vi.mock("./push.service", () => ({
  getPublicKey: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

describe("push.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPublicKey", () => {
    it("returns public key as JSON", () => {
      vi.mocked(PushService.getPublicKey).mockReturnValue("test-vapid-key");

      const req = createMockRequest();
      const res = createMockResponse();

      PushController.getPublicKey(req, res);

      expect(PushService.getPublicKey).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ publicKey: "test-vapid-key" });
    });
  });

  describe("subscribe", () => {
    it("saves subscription and responds with 204", async () => {
      vi.mocked(PushService.subscribe).mockResolvedValue(undefined);

      const req = createMockRequest({
        user: { internalUserId: "u-1" } as any,
        body: {
          endpoint: "https://push.example.com/1",
          keys: { p256dh: "key-p256", auth: "key-auth" },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await PushController.subscribe(req, res, next);

      expect(PushService.subscribe).toHaveBeenCalledWith("u-1", {
        endpoint: "https://push.example.com/1",
        keys: { p256dh: "key-p256", auth: "key-auth" },
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("throws BadRequestError and forwards to next when body is missing required fields", async () => {
      const testCases = [
        {},
        { endpoint: "https://push.example.com/1" },
        { endpoint: "https://push.example.com/1", keys: {} },
        { endpoint: "https://push.example.com/1", keys: { p256dh: "key-1" } },
        { keys: { p256dh: "k", auth: "a" } },
      ];

      for (const body of testCases) {
        const req = createMockRequest({
          user: { internalUserId: "u-1" } as any,
          body,
        });
        const res = createMockResponse();
        const next = createMockNext();

        await PushController.subscribe(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      }
    });

    it("forwards service error to next", async () => {
      const error = new Error("DB failure");
      vi.mocked(PushService.subscribe).mockRejectedValue(error);

      const req = createMockRequest({
        user: { internalUserId: "u-1" } as any,
        body: {
          endpoint: "https://push.example.com/1",
          keys: { p256dh: "key-p256", auth: "key-auth" },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await PushController.subscribe(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("unsubscribe", () => {
    it("deletes subscription and responds with 204", async () => {
      vi.mocked(PushService.unsubscribe).mockResolvedValue(undefined);

      const req = createMockRequest({
        body: { endpoint: "https://push.example.com/1" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await PushController.unsubscribe(req, res, next);

      expect(PushService.unsubscribe).toHaveBeenCalledWith("https://push.example.com/1");
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("throws BadRequestError when endpoint is missing", async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();
      const next = createMockNext();

      await PushController.unsubscribe(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it("forwards service error to next", async () => {
      const error = new Error("Delete failed");
      vi.mocked(PushService.unsubscribe).mockRejectedValue(error);

      const req = createMockRequest({
        body: { endpoint: "https://push.example.com/1" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await PushController.unsubscribe(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
