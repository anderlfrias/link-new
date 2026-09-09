import { UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import * as UserRepository from "./user.repository";

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    storedFile: {
      groupBy: vi.fn(),
    },
    conversationMember: {
      groupBy: vi.fn(),
    },
  },
}));

describe("user.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("search", () => {
    it("searches active users excluding current user with name/email query", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u-2", name: "Ana" }] as any);

      const result = await UserRepository.search("u-1", "ana");

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          status: UserStatus.ACTIVE,
          id: { not: "u-1" },
          OR: [
            { name: { contains: "ana", mode: "insensitive" } },
            { email: { contains: "ana", mode: "insensitive" } },
          ],
        },
        select: expect.any(Object),
        orderBy: { name: "asc" },
        take: 100,
      });
      expect(result).toHaveLength(1);
    });

    it("searches active users excluding current user without query filter", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await UserRepository.search("u-1");

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          status: UserStatus.ACTIVE,
          id: { not: "u-1" },
        },
        select: expect.any(Object),
        orderBy: { name: "asc" },
        take: 100,
      });
    });
  });

  describe("findAllForAdmin", () => {
    it("builds query with search filter across name, email, and username", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await UserRepository.findAllForAdmin({ search: "carlos" }, { limit: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: "carlos", mode: "insensitive" } },
            { email: { contains: "carlos", mode: "insensitive" } },
            { username: { contains: "carlos", mode: "insensitive" } },
          ],
        },
        select: expect.any(Object),
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    });

    it("supports cursor pagination with beforeId", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await UserRepository.findAllForAdmin({}, { beforeId: "u-prev", limit: 15 });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        select: expect.any(Object),
        orderBy: { createdAt: "desc" },
        take: 15,
        cursor: { id: "u-prev" },
        skip: 1,
      });
    });
  });

  describe("countAllForAdmin", () => {
    it("counts users matching search filter", async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(5);

      const count = await UserRepository.countAllForAdmin({ search: "doc" });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: "doc", mode: "insensitive" } },
            { email: { contains: "doc", mode: "insensitive" } },
            { username: { contains: "doc", mode: "insensitive" } },
          ],
        },
      });
      expect(count).toBe(5);
    });

    it("counts all users when no filter is provided", async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(10);

      const count = await UserRepository.countAllForAdmin({});

      expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
      expect(count).toBe(10);
    });
  });

  describe("sumStorageForUsers", () => {
    it("returns empty array immediately without querying prisma when userIds is empty", async () => {
      const result = await UserRepository.sumStorageForUsers([]);
      expect(result).toEqual([]);
      expect(prisma.storedFile.groupBy).not.toHaveBeenCalled();
    });

    it("groups storedFile by createdById for given userIds", async () => {
      const mockRows = [{ createdById: "u-1", _sum: { size: 1024 }, _count: 3 }];
      vi.mocked(prisma.storedFile.groupBy).mockResolvedValue(mockRows as any);

      const result = await UserRepository.sumStorageForUsers(["u-1", "u-2"]);

      expect(prisma.storedFile.groupBy).toHaveBeenCalledWith({
        by: ["createdById"],
        where: { createdById: { in: ["u-1", "u-2"] }, deletedAt: null },
        _sum: { size: true },
        _count: true,
      });
      expect(result).toEqual(mockRows);
    });
  });

  describe("countGroupAdminForUsers", () => {
    it("returns empty array immediately without querying prisma when userIds is empty", async () => {
      const result = await UserRepository.countGroupAdminForUsers([]);
      expect(result).toEqual([]);
      expect(prisma.conversationMember.groupBy).not.toHaveBeenCalled();
    });

    it("groups conversationMember by userId where isAdmin is true", async () => {
      const mockRows = [{ userId: "u-1", _count: 2 }];
      vi.mocked(prisma.conversationMember.groupBy).mockResolvedValue(mockRows as any);

      const result = await UserRepository.countGroupAdminForUsers(["u-1"]);

      expect(prisma.conversationMember.groupBy).toHaveBeenCalledWith({
        by: ["userId"],
        where: { userId: { in: ["u-1"] }, isAdmin: true },
        _count: true,
      });
      expect(result).toEqual(mockRows);
    });
  });
});
