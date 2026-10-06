import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCreateGroup } from "./use-create-group";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { createConversation } from "@/features/conversations/api/conversations.api";
import { uploadFile } from "@/features/files/api/files.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  createConversation: vi.fn(),
}));

vi.mock("@/features/files/api/files.api", () => ({
  uploadFile: vi.fn(),
}));

describe("useCreateGroup", () => {
  const mockSession = createMockSession({ token: "group-token" });
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as any);
  });

  it("creates a group without image and navigates to conversation", async () => {
    const createdConv = { id: "conv-grp-1", name: "My Group", type: "GROUP" };
    vi.mocked(createConversation).mockResolvedValueOnce(createdConv as any);

    const { result } = renderHook(() => useCreateGroup());

    let res: any;
    await act(async () => {
      res = await result.current.createGroup(["user-2", "user-3"], "My Group", null);
    });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(createConversation).toHaveBeenCalledWith("group-token", {
      type: "GROUP",
      memberIds: ["user-2", "user-3"],
      name: "My Group",
      imageFileId: undefined,
    });
    expect(mockPush).toHaveBeenCalledWith("/conversations/conv-grp-1");
    expect(res).toEqual(createdConv);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("uploads image first if imageFile is provided", async () => {
    const fakeFile = new File(["fake"], "avatar.png", { type: "image/png" });
    vi.mocked(uploadFile).mockResolvedValueOnce({ id: "file-123" } as any);
    const createdConv = { id: "conv-grp-2", name: "Photo Group", type: "GROUP" };
    vi.mocked(createConversation).mockResolvedValueOnce(createdConv as any);

    const { result } = renderHook(() => useCreateGroup());

    let res: any;
    await act(async () => {
      res = await result.current.createGroup(["user-2"], "Photo Group", fakeFile);
    });

    expect(uploadFile).toHaveBeenCalledWith("group-token", fakeFile);
    expect(createConversation).toHaveBeenCalledWith("group-token", {
      type: "GROUP",
      memberIds: ["user-2"],
      name: "Photo Group",
      imageFileId: "file-123",
    });
    expect(mockPush).toHaveBeenCalledWith("/conversations/conv-grp-2");
    expect(res).toEqual(createdConv);
  });

  it("captures error when group creation fails", async () => {
    vi.mocked(createConversation).mockRejectedValueOnce(new Error("Nombre de grupo inválido"));

    const { result } = renderHook(() => useCreateGroup());

    let res: any;
    await act(async () => {
      res = await result.current.createGroup(["user-2"], "", null);
    });

    expect(res).toBeNull();
    expect(result.current.error).toBe("Nombre de grupo inválido");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("returns null when session is null", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    const { result } = renderHook(() => useCreateGroup());

    let res: any;
    await act(async () => {
      res = await result.current.createGroup(["user-2"], "Group", null);
    });

    expect(res).toBeNull();
    expect(createConversation).not.toHaveBeenCalled();
  });
});
