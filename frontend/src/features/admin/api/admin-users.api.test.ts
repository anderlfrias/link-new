import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
  unlockAdminUser,
  updateAdminUser,
} from "./admin-users.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("admin-users.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAdminUsers sends GET request to /v1/admin/users with token and query", async () => {
    const mockResponse = { users: [], totalCount: 0 };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const result = await listAdminUsers("token-xyz", { search: "maria", limit: 10 });

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/users", {
      token: "token-xyz",
      query: {
        before: undefined,
        limit: 10,
        search: "maria",
      },
    });
    expect(result).toBe(mockResponse);
  });

  it("listAdminUsers sends the status filter and hasPassword as a string", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ users: [], totalCount: 0 });

    await listAdminUsers("token-xyz", { status: "INACTIVE", hasPassword: false });

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/users", {
      token: "token-xyz",
      query: { before: undefined, limit: undefined, search: undefined, status: "INACTIVE", hasPassword: "false" },
    });
  });

  it("updateAdminUser sends PATCH with the payload", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "u-1" });

    await updateAdminUser("token-xyz", "u-1", { status: "INACTIVE" });

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/users/u-1", {
      method: "PATCH",
      token: "token-xyz",
      body: { status: "INACTIVE" },
    });
  });

  it("createAdminUser sends POST to the collection", async () => {
    const response = { user: { id: "u-1" }, temporaryPassword: "Tmp-1" };
    vi.mocked(apiRequest).mockResolvedValueOnce(response);

    const result = await createAdminUser("token-xyz", { name: "Ana", email: "ana@example.com", roles: [] });

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/users", {
      method: "POST",
      token: "token-xyz",
      body: { name: "Ana", email: "ana@example.com", roles: [] },
    });
    expect(result).toBe(response);
  });

  it("resetAdminUserPassword asks the backend to generate a temporary password", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ temporaryPassword: "Tmp-2" });

    await resetAdminUserPassword("token-xyz", "u-1");

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/users/u-1/password-reset", {
      method: "POST",
      token: "token-xyz",
      body: {},
    });
  });

  it("unlockAdminUser sends POST to unlock", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);

    await unlockAdminUser("token-xyz", "u-1");

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/users/u-1/unlock", { method: "POST", token: "token-xyz" });
  });
});
