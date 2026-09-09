import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationDangerConfirmModal } from "./ConversationDangerConfirmModal";

describe("ConversationDangerConfirmModal", () => {
  it("renders title, description and confirm button", () => {
    render(
      <ConversationDangerConfirmModal
        title="Eliminar grupo"
        description="Esta acción eliminará el grupo para todos."
        confirmLabel="Eliminar para todos"
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Eliminar grupo")).toBeInTheDocument();
    expect(screen.getByText("Esta acción eliminará el grupo para todos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar para todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConversationDangerConfirmModal
        title="Eliminar chat"
        description="Se ocultará el chat."
        confirmLabel="Eliminar"
        pending={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConversationDangerConfirmModal
        title="Salir del grupo"
        description="Dejarás de recibir mensajes."
        confirmLabel="Salir"
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("displays error message if provided", () => {
    render(
      <ConversationDangerConfirmModal
        title="Eliminar grupo"
        description="Texto descripción"
        confirmLabel="Eliminar"
        pending={false}
        error="No tienes permisos para eliminar este grupo"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("No tienes permisos para eliminar este grupo")).toBeInTheDocument();
  });

  it("disables buttons when pending is true", () => {
    const onConfirm = vi.fn();
    render(
      <ConversationDangerConfirmModal
        title="Eliminar grupo"
        description="Texto descripción"
        confirmLabel="Eliminar"
        pending={true}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "Eliminar" });
    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });

    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
