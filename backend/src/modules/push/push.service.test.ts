import { beforeEach, describe, expect, it, vi } from "vitest";
import env from "../../config/env";
import { BadRequestError } from "../../utils/errors";
import * as PushRepository from "./push.repository";

const { mockSendNotification, MockWebPushError } = vi.hoisted(() => {
  class MockWebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "WebPushError";
      this.statusCode = statusCode;
    }
  }
  return {
    mockSendNotification: vi.fn(),
    MockWebPushError,
  };
});

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockSendNotification,
  },
  WebPushError: MockWebPushError,
}));

vi.mock("./push.repository", () => ({
  upsertSubscription: vi.fn(),
  findByEndpoint: vi.fn(),
  deleteByEndpoint: vi.fn(),
  deleteByEndpointForUser: vi.fn(),
  findByUserIds: vi.fn(),
}));

import { getPublicKey, notifyUsers, subscribe, unsubscribe } from "./push.service";

const FCM_ENDPOINT_1 = "https://fcm.googleapis.com/fcm/send/sub-1";
const FCM_ENDPOINT_2 = "https://fcm.googleapis.com/fcm/send/sub-2";

describe("push.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPublicKey", () => {
    it("returns VAPID_PUBLIC_KEY from environment", () => {
      expect(getPublicKey()).toBe(env.VAPID_PUBLIC_KEY);
    });
  });

  describe("subscribe", () => {
    it("delegates upsert to repository with user ID and keys", async () => {
      vi.mocked(PushRepository.findByEndpoint).mockResolvedValue(null);
      vi.mocked(PushRepository.upsertSubscription).mockResolvedValue({} as any);

      await subscribe("u-1", {
        endpoint: FCM_ENDPOINT_1,
        keys: { p256dh: "key-p256", auth: "key-auth" },
      });

      expect(PushRepository.upsertSubscription).toHaveBeenCalledWith("u-1", FCM_ENDPOINT_1, "key-p256", "key-auth");
    });

    it("rechaza un endpoint fuera de la allowlist sin guardarlo", async () => {
      const attempt = subscribe("u-1", {
        endpoint: "https://10.0.0.5:8443/internal",
        keys: { p256dh: "key-p256", auth: "key-auth" },
      });

      await expect(attempt).rejects.toThrow(BadRequestError);
      await expect(attempt).rejects.toMatchObject({ code: "push_endpoint_not_allowed" });
      expect(PushRepository.findByEndpoint).not.toHaveBeenCalled();
      expect(PushRepository.upsertSubscription).not.toHaveBeenCalled();
    });

    it("reasigna un endpoint de otro usuario si las claves coinciden (mismo navegador, otra persona)", async () => {
      vi.mocked(PushRepository.findByEndpoint).mockResolvedValue({
        id: "sub-1",
        userId: "u-anterior",
        endpoint: FCM_ENDPOINT_1,
        p256dh: "key-p256",
        auth: "key-auth",
      } as any);
      vi.mocked(PushRepository.upsertSubscription).mockResolvedValue({} as any);

      await subscribe("u-1", { endpoint: FCM_ENDPOINT_1, keys: { p256dh: "key-p256", auth: "key-auth" } });

      expect(PushRepository.upsertSubscription).toHaveBeenCalledWith("u-1", FCM_ENDPOINT_1, "key-p256", "key-auth");
    });

    it("no reasigna un endpoint de otro usuario si las claves no coinciden", async () => {
      vi.mocked(PushRepository.findByEndpoint).mockResolvedValue({
        id: "sub-1",
        userId: "u-dueño",
        endpoint: FCM_ENDPOINT_1,
        p256dh: "key-p256",
        auth: "key-auth",
      } as any);

      await expect(
        subscribe("u-atacante", { endpoint: FCM_ENDPOINT_1, keys: { p256dh: "otra-clave", auth: "otra-auth" } }),
      ).resolves.toBeUndefined();

      expect(PushRepository.upsertSubscription).not.toHaveBeenCalled();
    });

    it("actualiza las claves de una suscripción propia", async () => {
      vi.mocked(PushRepository.findByEndpoint).mockResolvedValue({
        id: "sub-1",
        userId: "u-1",
        endpoint: FCM_ENDPOINT_1,
        p256dh: "vieja",
        auth: "vieja",
      } as any);
      vi.mocked(PushRepository.upsertSubscription).mockResolvedValue({} as any);

      await subscribe("u-1", { endpoint: FCM_ENDPOINT_1, keys: { p256dh: "nueva", auth: "nueva" } });

      expect(PushRepository.upsertSubscription).toHaveBeenCalledWith("u-1", FCM_ENDPOINT_1, "nueva", "nueva");
    });
  });

  describe("unsubscribe", () => {
    it("borra solo la suscripción del usuario actual", async () => {
      vi.mocked(PushRepository.deleteByEndpointForUser).mockResolvedValue({ count: 1 } as any);

      await unsubscribe("u-1", FCM_ENDPOINT_1);

      expect(PushRepository.deleteByEndpointForUser).toHaveBeenCalledWith(FCM_ENDPOINT_1, "u-1");
      // Nunca por endpoint a secas: saber el endpoint de otra persona no alcanza.
      expect(PushRepository.deleteByEndpoint).not.toHaveBeenCalled();
    });
  });

  describe("notifyUsers", () => {
    const payload = {
      title: "Nuevo mensaje",
      body: "Hola mundo",
      url: "/conversations/conv-1",
      tag: "conv-1",
    };

    it("returns immediately without querying repository when userIds array is empty", async () => {
      await notifyUsers([], payload);

      expect(PushRepository.findByUserIds).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("sends push notifications to all subscriptions found for userIds", async () => {
      const mockSubscriptions = [
        {
          id: "sub-1",
          userId: "u-1",
          endpoint: FCM_ENDPOINT_1,
          p256dh: "key-1",
          auth: "auth-1",
        },
        {
          id: "sub-2",
          userId: "u-2",
          endpoint: FCM_ENDPOINT_2,
          p256dh: "key-2",
          auth: "auth-2",
        },
      ];

      vi.mocked(PushRepository.findByUserIds).mockResolvedValue(mockSubscriptions as any);
      mockSendNotification.mockResolvedValue({});

      await notifyUsers(["u-1", "u-2"], payload);

      expect(PushRepository.findByUserIds).toHaveBeenCalledWith(["u-1", "u-2"]);
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: FCM_ENDPOINT_1, keys: { p256dh: "key-1", auth: "auth-1" } },
        JSON.stringify(payload),
      );
      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: FCM_ENDPOINT_2, keys: { p256dh: "key-2", auth: "auth-2" } },
        JSON.stringify(payload),
      );
    });

    it("no envía a filas con endpoint no permitido y las borra", async () => {
      vi.mocked(PushRepository.findByUserIds).mockResolvedValue([
        { id: "sub-viejo", userId: "u-1", endpoint: "https://10.0.0.5:8443/internal", p256dh: "k", auth: "a" },
        { id: "sub-ok", userId: "u-2", endpoint: FCM_ENDPOINT_2, p256dh: "k", auth: "a" },
      ] as any);
      vi.mocked(PushRepository.deleteByEndpoint).mockResolvedValue({ count: 1 } as any);
      mockSendNotification.mockResolvedValue({});

      await notifyUsers(["u-1", "u-2"], payload);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      expect(mockSendNotification).toHaveBeenCalledWith(expect.objectContaining({ endpoint: FCM_ENDPOINT_2 }), expect.any(String));
      expect(PushRepository.deleteByEndpoint).toHaveBeenCalledWith("https://10.0.0.5:8443/internal");
    });

    it("cleans up expired subscription (410 Gone / 404 Not Found) from database", async () => {
      const expired = "https://fcm.googleapis.com/fcm/send/expired";
      const notFound = "https://fcm.googleapis.com/fcm/send/not-found";
      const mockSubscriptions = [
        { id: "sub-1", userId: "u-1", endpoint: expired, p256dh: "key-1", auth: "auth-1" },
        { id: "sub-2", userId: "u-2", endpoint: notFound, p256dh: "key-2", auth: "auth-2" },
      ];

      vi.mocked(PushRepository.findByUserIds).mockResolvedValue(mockSubscriptions as any);
      vi.mocked(PushRepository.deleteByEndpoint).mockResolvedValue({ count: 1 } as any);

      mockSendNotification
        .mockRejectedValueOnce(new MockWebPushError("Subscription expired", 410))
        .mockRejectedValueOnce(new MockWebPushError("Subscription not found", 404));

      await notifyUsers(["u-1", "u-2"], payload);

      expect(PushRepository.deleteByEndpoint).toHaveBeenCalledWith(expired);
      expect(PushRepository.deleteByEndpoint).toHaveBeenCalledWith(notFound);
    });

    it("ignores non-expiration errors without deleting subscription and without throwing", async () => {
      const mockSubscriptions = [
        {
          id: "sub-1",
          userId: "u-1",
          endpoint: "https://fcm.googleapis.com/fcm/send/temp-fail",
          p256dh: "key-1",
          auth: "auth-1",
        },
      ];

      vi.mocked(PushRepository.findByUserIds).mockResolvedValue(mockSubscriptions as any);

      mockSendNotification.mockRejectedValueOnce(new MockWebPushError("Internal GCM error", 500));

      await expect(notifyUsers(["u-1"], payload)).resolves.toBeUndefined();

      expect(PushRepository.deleteByEndpoint).not.toHaveBeenCalled();
    });
  });
});
