import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditRow } from "./AdminAuditRow";
import type { AdminAuditLogListItem } from "@/features/admin/types/admin-audit.types";
import type { AuthConfig } from "@/features/auth/types/auth.types";
import { createMockAuthConfig } from "@/test/test-utils";

// El proveedor de esta instalación lo dice `GET /auth/config`: cada test elige el suyo.
let mockConfig: AuthConfig | null = null;
vi.mock("@/providers/auth-config-provider", () => ({
  useAuthConfig: () => ({ config: mockConfig, refresh: vi.fn() }),
}));

describe("AdminAuditRow", () => {
  const sampleLog: AdminAuditLogListItem = {
    id: "log-1",
    action: "ADMIN_DELETE_FILE",
    createdAt: "2026-09-10T15:30:00.000Z",
    actor: {
      id: "u-admin",
      name: "Carlos Admin",
      email: "carlos@example.com",
    },
    conversationId: null,
    conversationName: null,
    messageId: null,
    targetType: "StoredFile",
    targetId: "file-xyz-123456",
    metadata: {
      provider: "LOCAL",
      sizeBytes: 1048576,
      mimeType: "image/png",
    },
    ip: "192.168.1.50",
    userAgent: "Mozilla/5.0 (Windows NT 10.0)",
    requestId: "req-abc-999",
  };

  it("muestra la etiqueta en castellano de la acción y los datos del actor y recurso", () => {
    render(<AdminAuditRow item={sampleLog} />);

    // Acción traducida en castellano (nunca ADMIN_DELETE_FILE crudo)
    expect(screen.getByText("Eliminación de archivo por admin")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN_DELETE_FILE")).not.toBeInTheDocument();

    // Actor
    expect(screen.getByText(/Carlos Admin · carlos@example.com/i)).toBeInTheDocument();

    // Recurso e IP
    expect(screen.getByText(/StoredFile/)).toBeInTheDocument();
    expect(screen.getByText(/192.168.1.50/)).toBeInTheDocument();
  });

  it("expande y oculta el detalle de metadata al hacer click en el botón", async () => {
    const user = userEvent.setup();
    render(<AdminAuditRow item={sampleLog} />);

    // Inicialmente no está expandido
    expect(screen.queryByTestId("metadata-detail")).not.toBeInTheDocument();

    // Click en "Ver detalle"
    const toggleBtn = screen.getByRole("button", { name: "Ver detalle" });
    await user.click(toggleBtn);

    // Detalle visible
    expect(screen.getByTestId("metadata-detail")).toBeInTheDocument();
    expect(screen.getByText(/image\/png/)).toBeInTheDocument();
    expect(screen.getByText(/req-abc-999/)).toBeInTheDocument();

    // Click en "Ocultar detalle"
    await user.click(screen.getByRole("button", { name: "Ocultar detalle" }));
    expect(screen.queryByTestId("metadata-detail")).not.toBeInTheDocument();
  });

  it("si una fila no tiene metadata, no muestra botón de expandir", () => {
    const logNoMeta: AdminAuditLogListItem = {
      ...sampleLog,
      metadata: null,
    };

    render(<AdminAuditRow item={logNoMeta} />);
    expect(screen.queryByRole("button", { name: /detalle/i })).not.toBeInTheDocument();
  });

  describe("proveedor, motivo y origen", () => {
    beforeEach(() => {
      mockConfig = null;
    });

    const row = (action: string, metadata: unknown): AdminAuditLogListItem => ({
      ...sampleLog,
      action,
      metadata,
      targetType: null,
      targetId: null,
    });

    it("muestra el proveedor y el motivo de un login fallido", () => {
      render(<AdminAuditRow item={row("LOGIN_FAILED", { provider: "local", reason: "account_locked" })} />);
      expect(screen.getByText("Inicio de sesión fallido")).toBeInTheDocument();
      expect(screen.getByText("Local")).toBeInTheDocument();
      expect(screen.getByText("Cuenta bloqueada")).toBeInTheDocument();
    });

    it("interpreta un login sin provider (filas anteriores al modo local) como externo, sin nombrar ningún sistema", () => {
      render(<AdminAuditRow item={row("LOGIN", null)} />);
      expect(screen.getByText("Externo")).toBeInTheDocument();
    });

    it("muestra el id de un proveedor externo con su nombre si es el de esta instalación", () => {
      mockConfig = createMockAuthConfig("external");
      render(<AdminAuditRow item={row("LOGIN", { provider: "test-provider" })} />);
      expect(screen.getByText("Test Provider")).toBeInTheDocument();
      expect(screen.queryByText("test-provider")).not.toBeInTheDocument();
    });

    it("muestra crudo el id de otro proveedor, por ejemplo el de una instalación anterior", () => {
      mockConfig = createMockAuthConfig("external");
      render(<AdminAuditRow item={row("LOGIN", { provider: "proveedor-viejo" })} />);
      expect(screen.getByText("proveedor-viejo")).toBeInTheDocument();
    });

    it("sin configuración cargada muestra crudo el id de un proveedor externo", () => {
      render(<AdminAuditRow item={row("LOGIN", { provider: "test-provider" })} />);
      expect(screen.getByText("test-provider")).toBeInTheDocument();
    });

    it("traduce los motivos de un proveedor externo sin nombrar ningún sistema", () => {
      render(<AdminAuditRow item={row("LOGIN_FAILED", { provider: "test-provider", reason: "forbidden_by_provider" })} />);
      expect(screen.getByText("Rechazado por el proveedor de identidad")).toBeInTheDocument();
    });

    it("muestra el origen de las acciones de administración de cuentas", () => {
      render(<AdminAuditRow item={row("RESET_PASSWORD", { via: "cli" })} />);
      expect(screen.getByText("Restablecimiento de contraseña")).toBeInTheDocument();
      expect(screen.getByText("Desde la terminal (CLI)")).toBeInTheDocument();
    });

    it("muestra el motivo de un cambio de contraseña propio", () => {
      render(<AdminAuditRow item={row("CHANGE_PASSWORD", { reason: "expired" })} />);
      expect(screen.getByText("Cambio de contraseña")).toBeInTheDocument();
      expect(screen.getByText("Por vencimiento")).toBeInTheDocument();
      expect(screen.queryByText("Externo")).not.toBeInTheDocument();
    });

    it("muestra crudo un motivo que todavía no tiene traducción", () => {
      render(<AdminAuditRow item={row("LOGIN_FAILED", { provider: "test-provider", reason: "something_new" })} />);
      expect(screen.getByText("something_new")).toBeInTheDocument();
    });

    it("no confunde el provider de almacenamiento de un archivo con el de autenticación", () => {
      render(<AdminAuditRow item={sampleLog} />);
      expect(screen.queryByText("Local")).not.toBeInTheDocument();
      expect(screen.queryByText("LOCAL")).not.toBeInTheDocument();
    });
  });
});
