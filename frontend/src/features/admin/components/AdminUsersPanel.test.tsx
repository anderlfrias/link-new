import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUsersPanel } from "./AdminUsersPanel";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";

vi.mock("@/features/admin/hooks/use-admin-users", () => ({
  useAdminUsers: vi.fn(),
}));

describe("AdminUsersPanel", () => {
  const mockRefetch = vi.fn();
  const mockLoadMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders users and handles search submit and clear", async () => {
    const mockUsers = [
      {
        id: "u-1",
        name: "Carlos Sanchez",
        email: "carlos@test.com",
        username: "csanchez",
        avatarFileId: null,
        avatarFile: null,
        status: "ACTIVE" as const,
        createdAt: "2026-09-09T00:00:00.000Z",
        storage: { totalSize: 5000, fileCount: 2 },
        activity: { conversationCount: 3, messagesSentCount: 20, groupsAdministeredCount: 0 },
        syncProfileWithIntegration: true,
      },
    ];

    vi.mocked(useAdminUsers).mockReturnValue({
      users: mockUsers,
      status: "ready",
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: mockLoadMore,
      totalCount: 1,
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<AdminUsersPanel />);

    expect(screen.getByText("Carlos Sanchez")).toBeInTheDocument();
    expect(screen.getByText("1 usuario(s)")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Buscar por nombre, email o usuario");
    await user.type(input, "Carlos");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(useAdminUsers).toHaveBeenCalledWith({ search: "Carlos" });

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(input).toHaveValue("");
    expect(useAdminUsers).toHaveBeenCalledWith({});
  });

  it("renders error message and retry button when status is error", async () => {
    vi.mocked(useAdminUsers).mockReturnValue({
      users: [],
      status: "error",
      error: "Error del servidor",
      hasMore: false,
      loadingMore: false,
      loadMore: mockLoadMore,
      totalCount: 0,
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<AdminUsersPanel />);

    expect(screen.getByText("Error del servidor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
