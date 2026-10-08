import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUserRow } from "./AdminUserRow";
import type { AdminUserListItem } from "@/features/admin/types/admin-users.types";

describe("AdminUserRow", () => {
  const sampleUser: AdminUserListItem = {
    id: "usr-1",
    name: "Dra. María Lopez",
    email: "maria@example.com",
    username: "mlopez",
    createdAt: "2026-01-15T00:00:00.000Z",
    avatarFileId: "f-1",
    avatarFile: { path: "avatars/maria.png" },
    status: "ACTIVE",
    storage: {
      totalSize: 1048576,
      fileCount: 5,
    },
    activity: {
      conversationCount: 12,
      messagesSentCount: 350,
      groupsAdministeredCount: 2,
    },
    syncProfileWithIntegration: true,
  };

  it("renders user information, stats, and synchronization status", () => {
    render(<AdminUserRow user={sampleUser} providerName="Test Provider" />);

    expect(screen.getByText(/Dra. María Lopez/i)).toBeInTheDocument();
    expect(screen.getByText(/@mlopez/i)).toBeInTheDocument();
    expect(screen.getByText(/maria@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 MB · 5 archivo\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/12 conversaciones · 350 mensajes/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin de 2 grupo\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("Sincronizado con Test Provider")).toBeInTheDocument();
  });

  it("displays 'Editado localmente' when syncProfileWithIntegration is false", () => {
    render(<AdminUserRow user={{ ...sampleUser, syncProfileWithIntegration: false }} />);
    expect(screen.getByText("Editado localmente")).toBeInTheDocument();
  });
});

describe("AdminUserRow en modo local", () => {
  const localUser: AdminUserListItem = {
    id: "usr-2",
    name: "Pedro Gómez",
    email: "pedro@example.com",
    username: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    avatarFileId: null,
    avatarFile: null,
    status: "ACTIVE",
    storage: { totalSize: 0, fileCount: 0 },
    activity: { conversationCount: 0, messagesSentCount: 0, groupsAdministeredCount: 0 },
    syncProfileWithIntegration: true,
    localRoles: ["admin"],
    hasPassword: true,
    mustChangePassword: true,
    locked: true,
  };

  function renderLocal(overrides: Partial<AdminUserListItem> = {}, isSelf = false) {
    const handlers = {
      onSetStatus: vi.fn(),
      onEdit: vi.fn(),
      onResetPassword: vi.fn(),
      onUnlock: vi.fn(),
    };
    render(<AdminUserRow user={{ ...localUser, ...overrides }} accountManagement="full" isSelf={isSelf} {...handlers} />);
    return handlers;
  }

  it("shows the local badges instead of the provider sync status", () => {
    renderLocal();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText("Cambio de contraseña pendiente")).toBeInTheDocument();
    expect(screen.queryByText(/Sincronizado con/)).not.toBeInTheDocument();
  });

  it("marks accounts without a password and offers assigning one", () => {
    renderLocal({ hasPassword: false, mustChangePassword: false, locked: false });
    expect(screen.getByText("Sin contraseña")).toBeInTheDocument();
    expect(screen.queryByText("Cambio de contraseña pendiente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Asignar contraseña/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Desbloquear/ })).not.toBeInTheDocument();
  });

  it("calls the edit and unlock handlers directly", async () => {
    const user = userEvent.setup();
    const handlers = renderLocal();
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: /Desbloquear/ }));
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "usr-2" }));
    expect(handlers.onUnlock).toHaveBeenCalledWith(expect.objectContaining({ id: "usr-2" }));
  });

  it("asks for confirmation before resetting the password and lets the admin cancel", async () => {
    const user = userEvent.setup();
    const handlers = renderLocal();
    await user.click(screen.getByRole("button", { name: /Restablecer contraseña/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(handlers.onResetPassword).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Restablecer contraseña/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(handlers.onResetPassword).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before deactivating", async () => {
    const user = userEvent.setup();
    const handlers = renderLocal();
    await user.click(screen.getByRole("button", { name: /Desactivar/ }));
    expect(handlers.onSetStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(handlers.onSetStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "usr-2" }), "INACTIVE");
  });

  it("reactivates a deactivated account without confirmation", async () => {
    const user = userEvent.setup();
    const handlers = renderLocal({ status: "INACTIVE" });
    expect(screen.queryByRole("button", { name: /Desactivar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reactivar/ }));
    expect(handlers.onSetStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "usr-2" }), "ACTIVE");
  });

  it("does not let the admin deactivate their own account", () => {
    renderLocal({}, true);
    expect(screen.queryByRole("button", { name: /Desactivar/ })).not.toBeInTheDocument();
  });

  it("ignores the local handlers when the provider manages the accounts", () => {
    render(
      <AdminUserRow
        user={localUser}
        accountManagement="status-only"
        onSetStatus={vi.fn()}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
        onUnlock={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contraseña/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Bloqueada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Desactivar/ })).toBeInTheDocument();
  });
});

describe("AdminUserRow con las cuentas administradas por un proveedor", () => {
  const user: AdminUserListItem = {
    id: "usr-3",
    name: "Ana Díaz",
    email: "ana@example.com",
    username: "adiaz",
    createdAt: "2026-01-15T00:00:00.000Z",
    avatarFileId: null,
    avatarFile: null,
    status: "ACTIVE",
    storage: { totalSize: 0, fileCount: 0 },
    activity: { conversationCount: 0, messagesSentCount: 0, groupsAdministeredCount: 0 },
    syncProfileWithIntegration: true,
  };

  it("el texto de sincronización lleva el nombre del proveedor que informa la configuración", () => {
    render(<AdminUserRow user={user} providerName="Acme ID" />);

    expect(screen.getByText("Sincronizado con Acme ID")).toBeInTheDocument();
  });

  it("sin el nombre del proveedor usa un texto genérico, sin nombrar ningún sistema", () => {
    render(<AdminUserRow user={user} providerName={null} />);

    expect(screen.getByText("Sincronizado con el proveedor de identidad")).toBeInTheDocument();
  });

  it("por omisión (sin configuración cargada) muestra lo mínimo: solo estado, sin acciones de cuentas locales", () => {
    render(<AdminUserRow user={user} onEdit={vi.fn()} onResetPassword={vi.fn()} onUnlock={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restablecer/i })).not.toBeInTheDocument();
  });
});
