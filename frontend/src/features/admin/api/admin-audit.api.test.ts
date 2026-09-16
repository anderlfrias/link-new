import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAdminAuditLogs } from "./admin-audit.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("admin-audit.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("arma la URL con todos los query params y omite los undefined", async () => {
    const mockResponse = { items: [], nextCursor: null };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const query = {
      action: ["LOGIN", "UPDATE_SETTINGS"],
      userId: "u-123",
      limit: 50,
      from: "2026-09-01T00:00:00.000Z",
    };

    const result = await listAdminAuditLogs("adm-token", query);

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/audit-logs", {
      token: "adm-token",
      query: {
        before: undefined,
        limit: 50,
        action: "LOGIN,UPDATE_SETTINGS",
        userId: "u-123",
        targetType: undefined,
        from: "2026-09-01T00:00:00.000Z",
        to: undefined,
      },
    });
    expect(result).toBe(mockResponse);
  });

  it("acepta action como string simple", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [], nextCursor: null });

    await listAdminAuditLogs("adm-token", { action: "LOGIN" });

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/audit-logs", {
      token: "adm-token",
      query: {
        before: undefined,
        limit: undefined,
        action: "LOGIN",
        userId: undefined,
        targetType: undefined,
        from: undefined,
        to: undefined,
      },
    });
  });
});
