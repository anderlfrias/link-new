import { beforeEach, describe, expect, it, vi } from "vitest";
import env from "../../config/env";
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
  deleteByEndpoint: vi.fn(),
  findByUserIds: vi.fn(),
}));

import { getPublicKey, notifyUsers, subscribe, unsubscribe } from "./push.service";

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
      vi.mocked(PushRepository.upsertSubscription).mockResolvedValue({} as any);

      await subscribe("u-1", {
        endpoint: "https://push.example.com/sub/1",
        keys: { p256dh: "key-p256", auth: "key-auth" },
      });

      expect(PushRepository.upsertSubscription).toHaveBeenCalledWith(
        "u-1",
        "https://push.example.com/sub/1",
        "key-p256",
        "key-auth",
      );
    });
  });

  describe("unsubscribe", () => {
    it("delegates deletion to repository by endpoint", async () => {
      vi.mocked(PushRepository.deleteByEndpoint).mockResolvedValue({ count: 1 } as any);

      await unsubscribe("https://push.example.com/sub/1");

      expect(PushRepository.deleteByEndpoint).toHaveBeenCalledWith("https://push.example.com/sub/1");
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
          endpoint: "https://push.example.com/sub/1",
          p256dh: "key-1",
          auth: "auth-1",
        },
        {
          id: "sub-2",
          userId: "u-2",
          endpoint: "https://push.example.com/sub/2",
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
        { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "key-1", auth: "auth-1" } },
        JSON.stringify(payload),
      );
      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: "https://push.example.com/sub/2", keys: { p256dh: "key-2", auth: "auth-2" } },
        JSON.stringify(payload),
      );
    });

    it("cleans up expired subscription (410 Gone / 404 Not Found) from database", async () => {
      const mockSubscriptions = [
        {
          id: "sub-1",
          userId: "u-1",
          endpoint: "https://push.example.com/sub/expired",
          p256dh: "key-1",
          auth: "auth-1",
        },
        {
          id: "sub-2",
          userId: "u-2",
          endpoint: "https://push.example.com/sub/not-found",
          p256dh: "key-2",
          auth: "auth-2",
        },
      ];

      vi.mocked(PushRepository.findByUserIds).mockResolvedValue(mockSubscriptions as any);
      vi.mocked(PushRepository.deleteByEndpoint).mockResolvedValue({ count: 1 } as any);

      mockSendNotification
        .mockRejectedValueOnce(new MockWebPushError("Subscription expired", 410))
        .mockRejectedValueOnce(new MockWebPushError("Subscription not found", 404));

      await notifyUsers(["u-1", "u-2"], payload);

      expect(PushRepository.deleteByEndpoint).toHaveBeenCalledWith("https://push.example.com/sub/expired");
      expect(PushRepository.deleteByEndpoint).toHaveBeenCalledWith("https://push.example.com/sub/not-found");
    });

    it("ignores non-expiration errors without deleting subscription and without throwing", async () => {
      const mockSubscriptions = [
        {
          id: "sub-1",
          userId: "u-1",
          endpoint: "https://push.example.com/sub/temp-fail",
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
