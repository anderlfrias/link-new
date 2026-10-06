import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminFiles } from "./use-admin-files";
import { useAuth } from "@/providers/auth-provider";
import { listAdminFiles } from "@/features/admin/api/admin-files.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-files.api", () => ({
  listAdminFiles: vi.fn(),
}));

describe("useAdminFiles", () => {
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

  it("fetches files on mount and populates state", async () => {
    const mockData = {
      files: [
        { id: "f-1", originalName: "doc1.pdf", mimeType: "application/pdf", size: 1000, createdAt: "2026-09-09T00:00:00.000Z", usage: { avatarOfUserCount: 0, groupImageOfConversationCount: 0, messageAttachmentCount: 1 } },
      ],
      totalCount: 1,
      totalSize: 1000,
    };
    vi.mocked(listAdminFiles).mockResolvedValueOnce(mockData as any);

    const { result } = renderHook(() => useAdminFiles({}));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.files).toEqual(mockData.files);
    expect(result.current.totalCount).toBe(1);
    expect(result.current.totalSize).toBe(1000);
    expect(result.current.hasMore).toBe(false);
  });

  it("handles fetch error", async () => {
    vi.mocked(listAdminFiles).mockRejectedValueOnce(new Error("Error de conexión"));

    const { result } = renderHook(() => useAdminFiles({}));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("Error de conexión");
  });

  it("removeFile removes file from list and updates totalCount", async () => {
    const mockData = {
      files: [
        { id: "f-1", originalName: "doc1.pdf", mimeType: "application/pdf", size: 1000, createdAt: "2026-09-09T00:00:00.000Z", usage: { avatarOfUserCount: 0, groupImageOfConversationCount: 0, messageAttachmentCount: 1 } },
        { id: "f-2", originalName: "doc2.pdf", mimeType: "application/pdf", size: 2000, createdAt: "2026-09-09T00:00:00.000Z", usage: { avatarOfUserCount: 0, groupImageOfConversationCount: 0, messageAttachmentCount: 1 } },
      ],
      totalCount: 2,
      totalSize: 3000,
    };
    vi.mocked(listAdminFiles).mockResolvedValueOnce(mockData as any);

    const { result } = renderHook(() => useAdminFiles({}));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.removeFile("f-1");
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].id).toBe("f-2");
    expect(result.current.totalCount).toBe(1);
  });
});
