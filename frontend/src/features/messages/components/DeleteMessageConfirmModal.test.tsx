import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeleteMessageConfirmModal } from "./DeleteMessageConfirmModal";

describe("DeleteMessageConfirmModal", () => {
  it("renders title, description and confirm button", () => {
    render(
      <DeleteMessageConfirmModal
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Eliminar mensaje para todos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar para todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteMessageConfirmModal
        pending={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar para todos" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <DeleteMessageConfirmModal
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("displays error message when error is provided", () => {
    render(
      <DeleteMessageConfirmModal
        pending={false}
        error="Tiempo límite de eliminación excedido"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Tiempo límite de eliminación excedido")).toBeInTheDocument();
  });

  it("disables buttons when pending is true", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteMessageConfirmModal
        pending={true}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "Eliminar para todos" });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders multiple messages title and button when count > 1", () => {
    render(
      <DeleteMessageConfirmModal
        pending={false}
        error={null}
        count={3}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Eliminar 3 mensajes para todos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar para todos (3)" })).toBeInTheDocument();
  });
});

