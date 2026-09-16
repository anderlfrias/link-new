import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { useAdminAuditLogs } from "@/features/admin/hooks/use-admin-audit-logs";
import type { AdminAuditLogListItem } from "@/features/admin/types/admin-audit.types";

vi.mock("@/features/admin/hooks/use-admin-audit-logs", () => ({
  useAdminAuditLogs: vi.fn(),
}));

const mockAuditItem: AdminAuditLogListItem = {
  id: "log-1",
  action: "LOGIN",
  createdAt: "2026-09-10T12:00:00.000Z",
  actor: { id: "u-1", name: "Ana Perez", email: "ana@example.com" },
  conversationId: null,
  conversationName: null,
  messageId: null,
  targetType: null,
  targetId: null,
  metadata: null,
  ip: "192.168.1.1",
  userAgent: "Mozilla",
  requestId: "req-1",
};

function mockUseAdminAuditLogsReturn(overrides: Partial<ReturnType<typeof useAdminAuditLogs>> = {}) {
  return {
    items: [],
    status: "ready" as const,
    error: null,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("AdminAuditPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza filas y muestra el aviso de filtro por omisión cuando no hay acción seleccionada", () => {
    vi.mocked(useAdminAuditLogs).mockReturnValue(
      mockUseAdminAuditLogsReturn({
        items: [mockAuditItem],
      }),
    );

    render(<AdminAuditPanel />);

    expect(screen.getByText("Registro de Auditoría")).toBeInTheDocument();
    expect(screen.getByTestId("default-filter-notice")).toBeInTheDocument();
    expect(screen.getByText(/Filtro por omisión activo/i)).toBeInTheDocument();
    expect(screen.getByText("Ana Perez · ana@example.com")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando status es ready e items está vacío", () => {
    vi.mocked(useAdminAuditLogs).mockReturnValue(
      mockUseAdminAuditLogsReturn({
        items: [],
        status: "ready",
      }),
    );

    render(<AdminAuditPanel />);

    expect(screen.getByText("No se encontraron eventos de auditoría con estos filtros.")).toBeInTheDocument();
  });

  it("dispara la recarga al aplicar un filtro y oculta el aviso de filtro por omisión", async () => {
    vi.mocked(useAdminAuditLogs).mockReturnValue(
      mockUseAdminAuditLogsReturn({
        items: [mockAuditItem],
      }),
    );

    const user = userEvent.setup();
    render(<AdminAuditPanel />);

    // Seleccionamos una acción explícita
    await user.selectOptions(
      screen.getByDisplayValue("Filtro por defecto (Admin y autenticación)"),
      "SEND_MESSAGE",
    );

    // Escribimos un usuario
    await user.type(screen.getByPlaceholderText("ID de usuario o actor"), "u-999");

    // Click en "Filtrar"
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    // Se debe haber llamado a useAdminAuditLogs con los filtros
    expect(useAdminAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "SEND_MESSAGE",
        userId: "u-999",
      }),
    );
  });

  it("botón Limpiar resetea el formulario y los filtros", async () => {
    vi.mocked(useAdminAuditLogs).mockReturnValue(
      mockUseAdminAuditLogsReturn(),
    );

    const user = userEvent.setup();
    render(<AdminAuditPanel />);

    await user.type(screen.getByPlaceholderText("ID de usuario o actor"), "u-999");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    await user.click(screen.getByRole("button", { name: "Limpiar" }));

    expect(screen.getByPlaceholderText("ID de usuario o actor")).toHaveValue("");
    expect(useAdminAuditLogs).toHaveBeenLastCalledWith({});
  });

  it("muestra el botón Cargar más cuando hasMore es true y llama a loadMore al hacer click", async () => {
    const mockLoadMore = vi.fn();
    vi.mocked(useAdminAuditLogs).mockReturnValue(
      mockUseAdminAuditLogsReturn({
        items: [mockAuditItem],
        hasMore: true,
        loadMore: mockLoadMore,
      }),
    );

    const user = userEvent.setup();
    render(<AdminAuditPanel />);

    const loadMoreBtn = screen.getByRole("button", { name: /Cargar más/i });
    expect(loadMoreBtn).toBeInTheDocument();

    await user.click(loadMoreBtn);
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
  });
});
