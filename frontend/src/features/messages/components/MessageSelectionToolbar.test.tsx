import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageSelectionToolbar } from "./MessageSelectionToolbar";

describe("MessageSelectionToolbar", () => {
  it("renders selected count singular and plural correctly", () => {
    const { rerender } = render(
      <MessageSelectionToolbar
        selectedCount={1}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onForward={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    rerender(
      <MessageSelectionToolbar
        selectedCount={3}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onForward={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("3 seleccionados")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <MessageSelectionToolbar
        selectedCount={2}
        onClose={onClose}
        onCopy={vi.fn()}
        onForward={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Cerrar selección"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onCopy, onForward and onDelete when action buttons are clicked", async () => {
    const onCopy = vi.fn();
    const onForward = vi.fn();
    const onDelete = vi.fn();

    render(
      <MessageSelectionToolbar
        selectedCount={2}
        onClose={vi.fn()}
        onCopy={onCopy}
        onForward={onForward}
        onDelete={onDelete}
      />,
    );

    await userEvent.click(screen.getByLabelText("Copiar mensajes"));
    expect(onCopy).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("Reenviar mensajes"));
    expect(onForward).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("Eliminar mensajes"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("disables actions when canCopy, canForward, or canDelete are false", () => {
    render(
      <MessageSelectionToolbar
        selectedCount={2}
        canCopy={false}
        canForward={false}
        canDelete={false}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onForward={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Copiar mensajes")).toBeDisabled();
    expect(screen.getByLabelText("Reenviar mensajes")).toBeDisabled();
    expect(screen.getByLabelText("Eliminar mensajes")).toBeDisabled();
  });

  it("disables all actions when selectedCount is 0", () => {
    render(
      <MessageSelectionToolbar
        selectedCount={0}
        canCopy={true}
        canForward={true}
        canDelete={true}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onForward={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Copiar mensajes")).toBeDisabled();
    expect(screen.getByLabelText("Reenviar mensajes")).toBeDisabled();
    expect(screen.getByLabelText("Eliminar mensajes")).toBeDisabled();
  });
});
