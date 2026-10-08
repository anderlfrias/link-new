import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";
import * as UserController from "./user.controller";
import * as UserService from "./user.service";

vi.mock("./user.service", () => ({
  listUsers: vi.fn(),
  listUsersForAdmin: vi.fn(),
}));

vi.mock("./account-admin.service", () => ({
  updateUserAccount: vi.fn(),
  createLocalUser: vi.fn(),
  resetLocalPassword: vi.fn(),
  unlockLocalUser: vi.fn(),
}));

describe("user.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("calls listUsers with currentUserId and the trimmed search query (sin el token)", async () => {
      const mockUsers = [{ id: "u-2", name: "Bob" }];
      vi.mocked(UserService.listUsers).mockResolvedValue(mockUsers as any);

      const req = createMockRequest({
        user: { internalUserId: "u-1" } as any,
        headers: { authorization: "Bearer token-123" },
        query: { search: "  bob  " },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await UserController.list(req, res, next);

      expect(UserService.listUsers).toHaveBeenCalledWith("u-1", "bob");
      expect(res.json).toHaveBeenCalledWith(mockUsers);
      expect(next).not.toHaveBeenCalled();
    });

    it("passes undefined search when search query is whitespace or missing", async () => {
      vi.mocked(UserService.listUsers).mockResolvedValue([]);

      const req = createMockRequest({
        user: { internalUserId: "u-1" } as any,
        headers: { authorization: "Bearer token-123" },
        query: { search: "   " },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await UserController.list(req, res, next);

      expect(UserService.listUsers).toHaveBeenCalledWith("u-1", undefined);
    });

    it("forwards error to next when service throws", async () => {
      const error = new Error("Sync failed");
      vi.mocked(UserService.listUsers).mockRejectedValue(error);

      const req = createMockRequest({
        user: { internalUserId: "u-1" } as any,
        headers: { authorization: "Bearer token-123" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await UserController.list(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("listAdmin", () => {
    it("calls listUsersForAdmin with parsed options and returns json result", async () => {
      const mockResult = { users: [], totalCount: 0 };
      vi.mocked(UserService.listUsersForAdmin).mockResolvedValue(mockResult);

      const req = createMockRequest({
        headers: { authorization: "Bearer token-admin" },
        query: { search: "ana", before: "u-10", limit: "25" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await UserController.listAdmin(req, res, next);

      expect(UserService.listUsersForAdmin).toHaveBeenCalledWith(
        { search: "ana" },
        { beforeId: "u-10", limit: 25 },
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(next).not.toHaveBeenCalled();
    });

    it("handles non-numeric or missing limit gracefully as undefined", async () => {
      vi.mocked(UserService.listUsersForAdmin).mockResolvedValue({ users: [], totalCount: 0 });

      const req = createMockRequest({
        headers: { authorization: "Bearer token-admin" },
        query: { limit: "invalid" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await UserController.listAdmin(req, res, next);

      expect(UserService.listUsersForAdmin).toHaveBeenCalledWith(
        { search: undefined },
        { beforeId: undefined, limit: undefined },
      );
    });

    it("forwards error to next when service throws in listAdmin", async () => {
      const error = new Error("DB Error");
      vi.mocked(UserService.listUsersForAdmin).mockRejectedValue(error);

      const req = createMockRequest({
        headers: { authorization: "Bearer token-admin" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await UserController.listAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
