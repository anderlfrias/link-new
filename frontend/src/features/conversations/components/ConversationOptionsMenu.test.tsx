import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationOptionsMenu } from "./ConversationOptionsMenu";

describe("ConversationOptionsMenu", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <ConversationOptionsMenu
        open={false}
        onClose={vi.fn()}
        isPinned={false}
        isFavorite={false}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders pin and favorite options when open", () => {
    render(
      <ConversationOptionsMenu
        open={true}
        onClose={vi.fn()}
        isPinned={false}
        isFavorite={false}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Fijar arriba/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcar como favorito/i })).toBeInTheDocument();
  });

  it("renders 'Desfijar' and 'Quitar de favoritos' when already pinned/favorite", () => {
    render(
      <ConversationOptionsMenu
        open={true}
        onClose={vi.fn()}
        isPinned={true}
        isFavorite={true}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Desfijar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quitar de favoritos/i })).toBeInTheDocument();
  });

  it("calls onTogglePin and onClose when clicking pin", () => {
    const onClose = vi.fn();
    const onTogglePin = vi.fn();

    render(
      <ConversationOptionsMenu
        open={true}
        onClose={onClose}
        isPinned={false}
        isFavorite={false}
        onTogglePin={onTogglePin}
        onToggleFavorite={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Fijar arriba/i }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders 'Salir del grupo' and calls onLeaveGroup when provided", () => {
    const onClose = vi.fn();
    const onLeaveGroup = vi.fn();

    render(
      <ConversationOptionsMenu
        open={true}
        onClose={onClose}
        isPinned={false}
        isFavorite={false}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onLeaveGroup={onLeaveGroup}
      />,
    );

    const leaveBtn = screen.getByRole("button", { name: /Salir del grupo/i });
    expect(leaveBtn).toBeInTheDocument();

    fireEvent.click(leaveBtn);
    expect(onLeaveGroup).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders 'Eliminar chat' when onDeleteChat is provided", () => {
    const onClose = vi.fn();
    const onDeleteChat = vi.fn();

    render(
      <ConversationOptionsMenu
        open={true}
        onClose={onClose}
        isPinned={false}
        isFavorite={false}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDeleteChat={onDeleteChat}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: /Eliminar chat/i });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(onDeleteChat).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders 'Eliminar grupo' when onDeleteGroup is provided", () => {
    const onClose = vi.fn();
    const onDeleteGroup = vi.fn();

    render(
      <ConversationOptionsMenu
        open={true}
        onClose={onClose}
        isPinned={false}
        isFavorite={false}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDeleteGroup={onDeleteGroup}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: /Eliminar grupo/i });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(onDeleteGroup).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders 'Seleccionar' and calls onSelect when provided", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <ConversationOptionsMenu
        open={true}
        onClose={onClose}
        isPinned={false}
        isFavorite={false}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onSelect={onSelect}
      />,
    );

    const selectBtn = screen.getByRole("button", { name: /Seleccionar/i });
    expect(selectBtn).toBeInTheDocument();

    fireEvent.click(selectBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
