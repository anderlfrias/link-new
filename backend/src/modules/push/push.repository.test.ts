import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import * as PushRepository from "./push.repository";

vi.mock("../../config/prisma", () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("push.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertSubscription", () => {
    it("upserts subscription using endpoint as unique key", async () => {
      const mockSub = { id: "sub-1", endpoint: "https://push.example.com/ep-1" };
      vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue(mockSub as any);

      const result = await PushRepository.upsertSubscription("u-1", "https://push.example.com/ep-1", "p256-key", "auth-key");

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: "https://push.example.com/ep-1" },
        update: { userId: "u-1", p256dh: "p256-key", auth: "auth-key" },
        create: { userId: "u-1", endpoint: "https://push.example.com/ep-1", p256dh: "p256-key", auth: "auth-key" },
      });
      expect(result).toBe(mockSub);
    });
  });

  describe("deleteByEndpoint", () => {
    it("deletes push subscription matching endpoint", async () => {
      vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 });

      await PushRepository.deleteByEndpoint("https://push.example.com/ep-1");

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: "https://push.example.com/ep-1" },
      });
    });
  });

  describe("findByUserIds", () => {
    it("finds all subscriptions belonging to the provided userIds", async () => {
      const mockSubs = [{ id: "sub-1", userId: "u-1" }, { id: "sub-2", userId: "u-2" }];
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(mockSubs as any);

      const result = await PushRepository.findByUserIds(["u-1", "u-2"]);

      expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ["u-1", "u-2"] } },
      });
      expect(result).toBe(mockSubs);
    });
  });
});
