import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAdminAuditLogs } from "@/features/admin/api/admin-audit.api";
import { useAuth } from "@/providers/auth-provider";
import { createMockSession } from "@/test/test-utils";
import { useAdminAuditLogs } from "./use-admin-audit-logs";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-audit.api", () => ({
  listAdminAuditLogs: vi.fn(),
}));

describe("useAdminAuditLogs", () => {
  const mockSession = createMockSession({ token: "adm-tok" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });
  });

  it("estado inicial y carga de registros exitosa", async () => {
    const mockData = {
      items: [
        {
          id: "log-1",
          action: "LOGIN",
          createdAt: "2026-09-10T10:00:00.000Z",
          actor: { id: "u-1", email: "alice@example.com", name: "Alice" },
          conversationId: null,
          conversationName: null,
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: "10.0.0.1",
          userAgent: null,
          requestId: null,
        },
      ],
      nextCursor: null,
    };
    vi.mocked(listAdminAuditLogs).mockResolvedValueOnce(mockData as any);

    const { result } = renderHook(() => useAdminAuditLogs({}));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.items).toEqual(mockData.items);
    expect(result.current.hasMore).toBe(false);
  });

  it("manejo de error en la carga", async () => {
    vi.mocked(listAdminAuditLogs).mockRejectedValueOnce(new Error("Fallo de red"));

    const { result } = renderHook(() => useAdminAuditLogs({}));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("Fallo de red");
  });

  it("paginación: pide la página siguiente con el nextCursor recibido", async () => {
    const firstPage = {
      items: [
        {
          id: "log-page-1",
          action: "LOGIN",
          createdAt: "2026-09-10T10:00:00.000Z",
          actor: { id: "u-1", email: "alice@example.com", name: "Alice" },
          conversationId: null,
          conversationName: null,
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          userAgent: null,
          requestId: null,
        },
      ],
      nextCursor: "cursor-123",
    };

    const secondPage = {
      items: [
        {
          id: "log-page-2",
          action: "UPDATE_SETTINGS",
          createdAt: "2026-09-10T09:00:00.000Z",
          actor: { id: "u-2", email: "admin@example.com", name: "Admin" },
          conversationId: null,
          conversationName: null,
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          userAgent: null,
          requestId: null,
        },
      ],
      nextCursor: null,
    };

    vi.mocked(listAdminAuditLogs)
      .mockResolvedValueOnce(firstPage as any)
      .mockResolvedValueOnce(secondPage as any);

    const { result } = renderHook(() => useAdminAuditLogs({}));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });

    expect(listAdminAuditLogs).toHaveBeenLastCalledWith(
      "adm-tok",
      expect.objectContaining({ before: "cursor-123" }),
    );
    expect(result.current.hasMore).toBe(false);
  });
});
