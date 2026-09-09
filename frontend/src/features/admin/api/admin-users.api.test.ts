import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAdminUsers } from "./admin-users.api";
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
});
