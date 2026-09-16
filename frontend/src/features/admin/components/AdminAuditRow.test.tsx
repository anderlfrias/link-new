import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminAuditRow } from "./AdminAuditRow";
import type { AdminAuditLogListItem } from "@/features/admin/types/admin-audit.types";

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
});
