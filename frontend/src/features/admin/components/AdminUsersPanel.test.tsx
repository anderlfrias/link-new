import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUsersPanel } from "./AdminUsersPanel";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import {
  createAdminUser,
  resetAdminUserPassword,
  unlockAdminUser,
  updateAdminUser,
} from "@/features/admin/api/admin-users.api";
import { useAuth } from "@/providers/auth-provider";
import type { AdminUserListItem } from "@/features/admin/types/admin-users.types";
import { createMockAuthConfig } from "@/test/test-utils";
import { deriveAuthCapabilities, useAuthCapabilities } from "@/providers/auth-config-provider";
import { ApiError } from "@/types/api.types";

vi.mock("@/features/admin/hooks/use-admin-users", () => ({
  useAdminUsers: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-users.api", () => ({
  createAdminUser: vi.fn(),
  resetAdminUserPassword: vi.fn(),
  unlockAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

// Qué se puede hacer con las cuentas lo decide `GET /auth/config`: cada test elige el proveedor.
vi.mock("@/providers/auth-config-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/providers/auth-config-provider")>()),
  useAuthCapabilities: vi.fn(),
}));

function mockProvider(kind: "local" | "external") {
  vi.mocked(useAuthCapabilities).mockReturnValue(deriveAuthCapabilities(createMockAuthConfig(kind)));
}

const ADMIN_ID = "admin-1";

function mockSession() {
  vi.mocked(useAuth).mockReturnValue({
    session: {
      token: "token-admin",
      user: {
        id: ADMIN_ID,
        email: "admin@example.com",
        username: "admin",
        fullName: "Admin",
        roles: ["admin"],
        exp: 0,
        internalUserId: ADMIN_ID,
        notificationSoundEnabled: true,
      },
    },
    status: "authenticated",
    login: vi.fn(),
    logout: vi.fn(),
    updateSessionUser: vi.fn(),
    expireSession: vi.fn(),
    completePasswordChange: vi.fn(),
  });
}

function makeUser(overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id: "u-1",
    name: "Carlos Sanchez",
    email: "carlos@test.com",
    username: "csanchez",
    avatarFileId: null,
    avatarFile: null,
    status: "ACTIVE",
    createdAt: "2026-09-09T00:00:00.000Z",
    storage: { totalSize: 5000, fileCount: 2 },
    activity: { conversationCount: 3, messagesSentCount: 20, groupsAdministeredCount: 0 },
    syncProfileWithIntegration: true,
    ...overrides,
  };
}

describe("AdminUsersPanel", () => {
  const mockRefetch = vi.fn();
  const mockLoadMore = vi.fn();

  function mockUsers(users: AdminUserListItem[]) {
    vi.mocked(useAdminUsers).mockReturnValue({
      users,
      status: "ready",
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: mockLoadMore,
      totalCount: users.length,
      refetch: mockRefetch,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
    mockProvider("external");
  });

  it("renders users and handles search submit and clear", async () => {
    mockUsers([makeUser({ localRoles: undefined })]);

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

  it("applies the status filter with any provider", async () => {
    mockUsers([makeUser()]);
    const user = userEvent.setup();
    render(<AdminUsersPanel />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "INACTIVE");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(useAdminUsers).toHaveBeenLastCalledWith({ search: undefined, status: "INACTIVE", hasPassword: undefined });
  });

  describe("con las cuentas administradas por un proveedor externo", () => {
    it("shows the provider notice and only lets the admin deactivate or reactivate access", () => {
      mockUsers([makeUser(), makeUser({ id: "u-2", name: "Ana Diaz", status: "INACTIVE" })]);
      render(<AdminUsersPanel />);

      expect(screen.getByText(/se administran en Test Provider/)).toBeInTheDocument();
      expect(screen.getAllByText("Sincronizado con Test Provider")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: /Crear cuenta/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Sin contraseña" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /contraseña/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Desactivar/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reactivar/ })).toBeInTheDocument();
    });

    it("deactivates an account after confirming and refetches the list", async () => {
      mockUsers([makeUser()]);
      vi.mocked(updateAdminUser).mockResolvedValue({} as never);
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Desactivar/ }));
      expect(updateAdminUser).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(updateAdminUser).toHaveBeenCalledWith("token-admin", "u-1", { status: "INACTIVE" });
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("does not offer deactivating the admin's own account", () => {
      mockUsers([makeUser({ id: ADMIN_ID })]);
      render(<AdminUsersPanel />);
      expect(screen.queryByRole("button", { name: /Desactivar/ })).not.toBeInTheDocument();
    });

    it("shows the translated backend error when the action is rejected", async () => {
      mockUsers([makeUser()]);
      vi.mocked(updateAdminUser).mockRejectedValue(
        new ApiError(409, "last admin", "last_admin"),
      );
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Desactivar/ }));
      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("al menos un admin activo");
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  describe("con cuentas locales", () => {
    beforeEach(() => {
      mockProvider("local");
    });

    it("shows the local notice, the create button and the without-password filter", async () => {
      mockUsers([makeUser({ localRoles: [], hasPassword: true })]);
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      expect(screen.getByText(/se administran desde este panel/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Crear cuenta/ })).toBeInTheDocument();
      expect(screen.queryByText(/Sincronizado con/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: "Sin contraseña" }));
      await user.click(screen.getByRole("button", { name: "Buscar" }));
      expect(useAdminUsers).toHaveBeenLastCalledWith({ search: undefined, status: undefined, hasPassword: false });
    });

    it("creates an account and shows the temporary password once", async () => {
      mockUsers([]);
      vi.mocked(createAdminUser).mockResolvedValue({
        user: {
          id: "u-9",
          name: "Nueva Persona",
          email: "nueva@example.com",
          username: null,
          status: "ACTIVE",
          localRoles: [],
          hasPassword: true,
          mustChangePassword: true,
          locked: false,
        },
        temporaryPassword: "Temp-Generada-123",
      });
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Crear cuenta/ }));
      const form = screen.getByRole("dialog", { name: "Crear cuenta" });
      await user.type(within(form).getByLabelText("Nombre"), "Nueva Persona");
      await user.type(within(form).getByLabelText("Correo electrónico"), "Nueva@Example.com");
      await user.click(within(form).getByRole("button", { name: "Crear" }));

      expect(createAdminUser).toHaveBeenCalledWith("token-admin", {
        name: "Nueva Persona",
        email: "nueva@example.com",
        username: null,
        roles: [],
      });
      expect(screen.queryByRole("dialog", { name: "Crear cuenta" })).not.toBeInTheDocument();
      const modal = screen.getByRole("dialog", { name: "Contraseña temporal" });
      expect(within(modal).getByTestId("temporary-password")).toHaveTextContent("Temp-Generada-123");
      expect(mockRefetch).toHaveBeenCalledTimes(1);

      await user.click(within(modal).getByRole("button", { name: "Cerrar" }));
      expect(screen.queryByTestId("temporary-password")).not.toBeInTheDocument();
    });

    it("keeps the form open with the error when the email is taken", async () => {
      mockUsers([]);
      vi.mocked(createAdminUser).mockRejectedValue(
        new ApiError(409, "email taken", "email_taken"),
      );
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Crear cuenta/ }));
      const form = screen.getByRole("dialog", { name: "Crear cuenta" });
      await user.type(within(form).getByLabelText("Nombre"), "Otra");
      await user.type(within(form).getByLabelText("Correo electrónico"), "otra@example.com");
      await user.click(within(form).getByRole("button", { name: "Crear" }));

      expect(await within(form).findByRole("alert")).toHaveTextContent("Ese correo ya está en uso.");
      expect(screen.queryByRole("dialog", { name: "Contraseña temporal" })).not.toBeInTheDocument();
    });

    it("edits an account with its current values", async () => {
      mockUsers([makeUser({ localRoles: ["admin"], hasPassword: true })]);
      vi.mocked(updateAdminUser).mockResolvedValue({} as never);
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Editar/ }));
      const form = screen.getByRole("dialog", { name: "Editar cuenta" });
      expect(within(form).getByLabelText("Nombre")).toHaveValue("Carlos Sanchez");
      expect(within(form).getByRole("checkbox", { name: "Administrador de la instalación" })).toBeChecked();

      const name = within(form).getByLabelText("Nombre");
      await user.clear(name);
      await user.type(name, "Carlos S.");
      await user.click(within(form).getByRole("button", { name: "Guardar" }));

      expect(updateAdminUser).toHaveBeenCalledWith("token-admin", "u-1", {
        name: "Carlos S.",
        email: "carlos@test.com",
        username: "csanchez",
        roles: ["admin"],
      });
      expect(screen.queryByRole("dialog", { name: "Editar cuenta" })).not.toBeInTheDocument();
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("does not let the admin remove their own admin role", async () => {
      mockUsers([makeUser({ id: ADMIN_ID, localRoles: ["admin"], hasPassword: true })]);
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Editar/ }));
      expect(screen.getByRole("checkbox", { name: "Administrador de la instalación" })).toBeDisabled();
    });

    it("resets a password after confirming and shows the temporary one", async () => {
      mockUsers([makeUser({ hasPassword: true })]);
      vi.mocked(resetAdminUserPassword).mockResolvedValue({ temporaryPassword: "Temp-Reset-456" });
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Restablecer contraseña/ }));
      expect(screen.getByText(/Se cierran sus sesiones abiertas/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(resetAdminUserPassword).toHaveBeenCalledWith("token-admin", "u-1");
      expect(await screen.findByTestId("temporary-password")).toHaveTextContent("Temp-Reset-456");
      expect(screen.getByText(/Contraseña temporal de carlos@test\.com/)).toBeInTheDocument();
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("unlocks a locked account", async () => {
      mockUsers([makeUser({ hasPassword: true, locked: true })]);
      vi.mocked(unlockAdminUser).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Desbloquear/ }));

      expect(unlockAdminUser).toHaveBeenCalledWith("token-admin", "u-1");
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("never writes the temporary password to localStorage", async () => {
      mockUsers([makeUser({ hasPassword: true })]);
      vi.mocked(resetAdminUserPassword).mockResolvedValue({ temporaryPassword: "Temp-Secreta-789" });
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const user = userEvent.setup();
      render(<AdminUsersPanel />);

      await user.click(screen.getByRole("button", { name: /Restablecer contraseña/ }));
      await user.click(screen.getByRole("button", { name: "Confirmar" }));
      await screen.findByTestId("temporary-password");

      const stored = setItem.mock.calls.map((call) => call.join(" "));
      expect(stored.some((value) => value.includes("Temp-Secreta-789"))).toBe(false);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        expect(localStorage.getItem(key)).not.toContain("Temp-Secreta-789");
      }
      setItem.mockRestore();
    });
  });
});
