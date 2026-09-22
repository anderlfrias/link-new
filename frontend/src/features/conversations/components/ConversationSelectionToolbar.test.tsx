import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationSelectionToolbar } from "./ConversationSelectionToolbar";

describe("ConversationSelectionToolbar", () => {
  const defaultProps = {
    selectedCount: 2,
    totalCount: 5,
    allSelected: false,
    onToggleSelectAll: vi.fn(),
    onClose: vi.fn(),
    canMarkAsRead: true,
    onMarkAsRead: vi.fn(),
    canPin: true,
    isAllPinned: false,
    onTogglePin: vi.fn(),
    canFavorite: true,
    isAllFavorite: false,
    onToggleFavorite: vi.fn(),
    hasGroupsSelected: true,
    onLeaveGroups: vi.fn(),
    canDelete: true,
    onDelete: vi.fn(),
    pending: false,
  };

  it("renderiza el contador y todos los botones de acción", () => {
    render(<ConversationSelectionToolbar {...defaultProps} />);

    expect(screen.getByText("2 seleccionadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar selección" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seleccionar todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar como leídos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fijar chats" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar como favoritos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir de los grupos seleccionados" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar chats seleccionados" })).toBeInTheDocument();
  });

  it("muestra '1 seleccionada' en singular", () => {
    render(<ConversationSelectionToolbar {...defaultProps} selectedCount={1} />);
    expect(screen.getByText("1 seleccionada")).toBeInTheDocument();
  });

  it("muestra 'Deseleccionar todos' si allSelected es true", () => {
    render(<ConversationSelectionToolbar {...defaultProps} allSelected={true} />);
    expect(screen.getByRole("button", { name: "Deseleccionar todos" })).toBeInTheDocument();
  });

  it("muestra 'Desfijar chats' y 'Quitar de favoritos' si los seleccionados ya lo tienen", () => {
    render(
      <ConversationSelectionToolbar
        {...defaultProps}
        isAllPinned={true}
        isAllFavorite={true}
      />,
    );

    expect(screen.getByRole("button", { name: "Desfijar chats" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar de favoritos" })).toBeInTheDocument();
  });

  it("oculta botones contextuales si no aplican", () => {
    render(
      <ConversationSelectionToolbar
        {...defaultProps}
        canMarkAsRead={false}
        hasGroupsSelected={false}
        canDelete={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Marcar como leídos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salir de los grupos seleccionados" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar chats seleccionados" })).not.toBeInTheDocument();
  });

  it("dispara callbacks al hacer clic en los botones", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps,
      onClose: vi.fn(),
      onToggleSelectAll: vi.fn(),
      onMarkAsRead: vi.fn(),
      onTogglePin: vi.fn(),
      onToggleFavorite: vi.fn(),
      onLeaveGroups: vi.fn(),
      onDelete: vi.fn(),
    };

    render(<ConversationSelectionToolbar {...props} />);

    await user.click(screen.getByRole("button", { name: "Cerrar selección" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Seleccionar todos" }));
    expect(props.onToggleSelectAll).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Marcar como leídos" }));
    expect(props.onMarkAsRead).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Fijar chats" }));
    expect(props.onTogglePin).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Marcar como favoritos" }));
    expect(props.onToggleFavorite).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Salir de los grupos seleccionados" }));
    expect(props.onLeaveGroups).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Eliminar chats seleccionados" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("deshabilita los botones durante estado pending", () => {
    render(<ConversationSelectionToolbar {...defaultProps} pending={true} />);

    expect(screen.getByRole("button", { name: "Cerrar selección" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Seleccionar todos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marcar como leídos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fijar chats" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Eliminar chats seleccionados" })).toBeDisabled();
  });
});
