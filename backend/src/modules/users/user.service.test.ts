import { beforeEach, describe, expect, it, vi } from "vitest";
import * as AuthService from "../auth/auth.service";
import * as UserRepository from "./user.repository";
import { listUsers, listUsersForAdmin } from "./user.service";

vi.mock("../auth/auth.service", () => ({
  syncAppUsers: vi.fn(),
}));

vi.mock("./user.repository", () => ({
  search: vi.fn(),
  findAllForAdmin: vi.fn(),
  countAllForAdmin: vi.fn(),
  sumStorageForUsers: vi.fn(),
  countGroupAdminForUsers: vi.fn(),
}));

describe("user.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listUsers", () => {
    it("synchronizes users via AuthService and delegates search to repository", async () => {
      const mockUsers = [{ id: "u-2", name: "Maria" }];
      vi.mocked(AuthService.syncAppUsers).mockResolvedValue(undefined as any);
      vi.mocked(UserRepository.search).mockResolvedValue(mockUsers as any);

      const result = await listUsers("u-1", "token-xyz", "maria");

      expect(AuthService.syncAppUsers).toHaveBeenCalledWith("token-xyz");
      expect(UserRepository.search).toHaveBeenCalledWith("u-1", "maria");
      expect(result).toBe(mockUsers);
    });
  });

  describe("listUsersForAdmin", () => {
    it("clamps limit between 1 and 100, defaulting to 30", async () => {
      vi.mocked(AuthService.syncAppUsers).mockResolvedValue(undefined as any);
      vi.mocked(UserRepository.findAllForAdmin).mockResolvedValue([]);
      vi.mocked(UserRepository.countAllForAdmin).mockResolvedValue(0);
      vi.mocked(UserRepository.sumStorageForUsers).mockResolvedValue([]);
      vi.mocked(UserRepository.countGroupAdminForUsers).mockResolvedValue([]);

      // Test default limit (30)
      await listUsersForAdmin("token-xyz", {}, {});
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({}, { beforeId: undefined, limit: 30 });

      // Test limit clamped to min 1
      await listUsersForAdmin("token-xyz", {}, { limit: -5 });
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({}, { beforeId: undefined, limit: 1 });

      // Test limit clamped to max 100
      await listUsersForAdmin("token-xyz", {}, { limit: 500 });
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({}, { beforeId: undefined, limit: 100 });
    });

    it("aggregates storage and group administration stats correctly for each user", async () => {
      vi.mocked(AuthService.syncAppUsers).mockResolvedValue(undefined as any);

      const mockRows = [
        {
          id: "u-1",
          name: "Alice",
          email: "alice@example.com",
          username: "alice",
          status: "ACTIVE",
          _count: {
            conversationMemberships: 5,
            sentMessages: 42,
          },
        },
        {
          id: "u-2",
          name: "Bob",
          email: "bob@example.com",
          username: "bob",
          status: "ACTIVE",
          _count: {
            conversationMemberships: 2,
            sentMessages: 0,
          },
        },
      ];

      vi.mocked(UserRepository.findAllForAdmin).mockResolvedValue(mockRows as any);
      vi.mocked(UserRepository.countAllForAdmin).mockResolvedValue(2);

      // u-1 has storage, u-2 has none
      vi.mocked(UserRepository.sumStorageForUsers).mockResolvedValue([
        { createdById: "u-1", _count: 4, _sum: { size: 1048576 } },
      ] as any);

      // u-1 is admin in 1 group, u-2 in 0 groups
      vi.mocked(UserRepository.countGroupAdminForUsers).mockResolvedValue([
        { userId: "u-1", _count: 1 },
      ] as any);

      const result = await listUsersForAdmin("token-xyz", { search: "test" }, { limit: 10 });

      expect(AuthService.syncAppUsers).toHaveBeenCalledWith("token-xyz");
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({ search: "test" }, { beforeId: undefined, limit: 10 });
      expect(UserRepository.countAllForAdmin).toHaveBeenCalledWith({ search: "test" });
      expect(UserRepository.sumStorageForUsers).toHaveBeenCalledWith(["u-1", "u-2"]);
      expect(UserRepository.countGroupAdminForUsers).toHaveBeenCalledWith(["u-1", "u-2"]);

      expect(result.totalCount).toBe(2);
      expect(result.users).toEqual([
        {
          id: "u-1",
          name: "Alice",
          email: "alice@example.com",
          username: "alice",
          status: "ACTIVE",
          storage: {
            fileCount: 4,
            totalSize: 1048576,
          },
          activity: {
            conversationCount: 5,
            messagesSentCount: 42,
            groupsAdministeredCount: 1,
          },
        },
        {
          id: "u-2",
          name: "Bob",
          email: "bob@example.com",
          username: "bob",
          status: "ACTIVE",
          storage: {
            fileCount: 0,
            totalSize: 0,
          },
          activity: {
            conversationCount: 2,
            messagesSentCount: 0,
            groupsAdministeredCount: 0,
          },
        },
      ]);
    });
  });
});
