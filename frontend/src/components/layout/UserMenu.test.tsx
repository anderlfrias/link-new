import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "./UserMenu";
import { useAuth } from "@/providers/auth-provider";
import { useProfilePicture } from "@/features/auth/hooks/use-profile-picture";
import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/auth/hooks/use-profile-picture", () => ({
  useProfilePicture: vi.fn(),
}));

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProfilePicture).mockReturnValue({
      url: null,
      refresh: vi.fn(),
    });
  });

  it("returns null when no session is present", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const { container } = render(
      <UserMenu onOpenProfileSettings={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens menu on click and displays user info and options", async () => {
    const mockSession = createMockSession({
      user: {
        ...createMockSession().user,
        fullName: "Dr. Mario Rossi",
        email: "mario@example.com",
        roles: ["USER"],
      },
    });

    const logout = vi.fn();
    const handleOpenProfile = vi.fn();

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout,
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const user = userEvent.setup();
    render(<UserMenu onOpenProfileSettings={handleOpenProfile} />);

    const trigger = screen.getByRole("button", { name: "Menú de usuario" });
    expect(trigger).toBeInTheDocument();

    // Menu is closed initially
    expect(screen.queryByText("Dr. Mario Rossi")).not.toBeInTheDocument();

    // Open menu
    await user.click(trigger);
    expect(screen.getByText("Dr. Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("mario@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar perfil/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Panel de administración/i })).not.toBeInTheDocument();

    // Click edit profile
    await user.click(screen.getByRole("button", { name: /Editar perfil/i }));
    expect(handleOpenProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Dr. Mario Rossi")).not.toBeInTheDocument();
  });

  it("renders admin link when user has ADMIN_ROLE", async () => {
    const mockSession = createMockSession({
      user: {
        ...createMockSession().user,
        roles: [ADMIN_ROLE, "USER"],
      },
    });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const user = userEvent.setup();
    render(<UserMenu onOpenProfileSettings={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Menú de usuario" }));
    const adminLink = screen.getByRole("link", { name: /Panel de administración/i });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute("href", "/admin");
  });

  it("calls logout when Cerrar sesión is clicked", async () => {
    const mockSession = createMockSession();
    const logout = vi.fn();

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout,
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const user = userEvent.setup();
    render(<UserMenu onOpenProfileSettings={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Menú de usuario" }));
    await user.click(screen.getByRole("button", { name: /Cerrar sesión/i }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("closes menu when clicking outside", async () => {
    const mockSession = createMockSession();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const user = userEvent.setup();
    render(
      <div>
        <span data-testid="outside">Outside area</span>
        <UserMenu onOpenProfileSettings={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Menú de usuario" }));
    expect(screen.getByText(mockSession.user.email)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText(mockSession.user.email)).not.toBeInTheDocument();
  });
});
