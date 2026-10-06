import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConversationFiles } from "./use-conversation-files";
import { useAuth } from "@/providers/auth-provider";
import { listConversationFiles } from "@/features/messages/api/messages.api";
import { createMockSession } from "@/test/test-utils";
import type { ConversationFile } from "@/features/messages/types/message.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/messages/api/messages.api", () => ({
  listConversationFiles: vi.fn(),
}));

describe("useConversationFiles", () => {
  const mockSession = createMockSession({ token: "files-token" });

  const mockFile: ConversationFile = {
    id: "f-1",
    originalName: "analisis.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    size: 1024,
    url: "https://example.com/analisis.pdf",
    createdAt: "2026-09-09T10:00:00Z",
    messageId: "m-1",
    senderId: "u-1",
  };

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

  it("loads conversation files on mount", async () => {
    vi.mocked(listConversationFiles).mockResolvedValueOnce([mockFile]);

    const { result } = renderHook(() => useConversationFiles("conv-1"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.files).toEqual([mockFile]);
    expect(listConversationFiles).toHaveBeenCalledWith("files-token", "conv-1", { limit: 50 });
  });

  it("handles fetch failure", async () => {
    vi.mocked(listConversationFiles).mockRejectedValueOnce(new Error("Fallo de red"));

    const { result } = renderHook(() => useConversationFiles("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.files).toEqual([]);
  });

  it("loads more older files when loadMore is called", async () => {
    // Return 50 files so hasMore is true
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      ...mockFile,
      id: `f-${i + 1}`,
    }));
    const olderFile = { ...mockFile, id: "f-51" };

    vi.mocked(listConversationFiles)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([olderFile]);

    const { result } = renderHook(() => useConversationFiles("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.files).toHaveLength(51);
    });

    expect(listConversationFiles).toHaveBeenLastCalledWith("files-token", "conv-1", {
      before: "f-50",
      limit: 50,
    });
  });
});
