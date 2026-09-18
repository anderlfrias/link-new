import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageOptionsMenu } from "./MessageOptionsMenu";

describe("MessageOptionsMenu", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <MessageOptionsMenu
        open={false}
        onClose={vi.fn()}
        canReply={true}
        canForward={true}
        canEdit={true}
        canDelete={true}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="right"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders all allowed options and invokes callbacks on click", () => {
    const onClose = vi.fn();
    const onReply = vi.fn();
    const onForward = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <MessageOptionsMenu
        open={true}
        onClose={onClose}
        canReply={true}
        canForward={true}
        canEdit={true}
        canDelete={true}
        onReply={onReply}
        onForward={onForward}
        onEdit={onEdit}
        onDelete={onDelete}
        align="right"
      />,
    );

    const replyBtn = screen.getByRole("menuitem", { name: /Responder/i });
    const forwardBtn = screen.getByRole("menuitem", { name: /Reenviar/i });
    const editBtn = screen.getByRole("menuitem", { name: /Editar/i });
    const deleteBtn = screen.getByRole("menuitem", { name: /Eliminar/i });

    expect(replyBtn).toBeInTheDocument();
    expect(forwardBtn).toBeInTheDocument();
    expect(editBtn).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(replyBtn);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(forwardBtn);
    expect(onForward).toHaveBeenCalledTimes(1);

    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("only renders permitted options", () => {
    render(
      <MessageOptionsMenu
        open={true}
        onClose={vi.fn()}
        canReply={true}
        canForward={false}
        canEdit={false}
        canDelete={false}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="left"
      />,
    );

    expect(screen.getByRole("menuitem", { name: /Responder/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Reenviar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Eliminar/i })).not.toBeInTheDocument();
  });

  it("renders 'Copiar' when only canCopyText is true and triggers callback", () => {
    const onClose = vi.fn();
    const onCopyText = vi.fn();

    render(
      <MessageOptionsMenu
        open={true}
        onClose={onClose}
        canReply={false}
        canForward={false}
        canEdit={false}
        canDelete={false}
        canCopyText={true}
        canCopyImage={false}
        onCopyText={onCopyText}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="right"
      />,
    );

    const copyBtn = screen.getByRole("menuitem", { name: "Copiar" });
    expect(copyBtn).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Copiar imagen/i })).not.toBeInTheDocument();

    fireEvent.click(copyBtn);
    expect(onCopyText).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders 'Copiar imagen' when only canCopyImage is true and triggers callback", () => {
    const onClose = vi.fn();
    const onCopyImage = vi.fn();

    render(
      <MessageOptionsMenu
        open={true}
        onClose={onClose}
        canReply={false}
        canForward={false}
        canEdit={false}
        canDelete={false}
        canCopyText={false}
        canCopyImage={true}
        onCopyImage={onCopyImage}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="left"
      />,
    );

    const copyImageBtn = screen.getByRole("menuitem", { name: "Copiar imagen" });
    expect(copyImageBtn).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Copiar$/i })).not.toBeInTheDocument();

    fireEvent.click(copyImageBtn);
    expect(onCopyImage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders both 'Copiar texto' and 'Copiar imagen' when both are true", () => {
    const onClose = vi.fn();
    const onCopyText = vi.fn();
    const onCopyImage = vi.fn();

    render(
      <MessageOptionsMenu
        open={true}
        onClose={onClose}
        canReply={true}
        canForward={true}
        canEdit={false}
        canDelete={false}
        canCopyText={true}
        canCopyImage={true}
        onCopyText={onCopyText}
        onCopyImage={onCopyImage}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="right"
      />,
    );

    const copyTextBtn = screen.getByRole("menuitem", { name: "Copiar texto" });
    const copyImageBtn = screen.getByRole("menuitem", { name: "Copiar imagen" });

    expect(copyTextBtn).toBeInTheDocument();
    expect(copyImageBtn).toBeInTheDocument();

    fireEvent.click(copyTextBtn);
    expect(onCopyText).toHaveBeenCalledTimes(1);

    fireEvent.click(copyImageBtn);
    expect(onCopyImage).toHaveBeenCalledTimes(1);
  });

  it("renders with fixed positioning when anchorPosition is provided and adjusts if near viewport edges", () => {
    window.innerHeight = 600;
    window.innerWidth = 800;

    render(
      <MessageOptionsMenu
        open={true}
        onClose={vi.fn()}
        canReply={true}
        canForward={false}
        canEdit={false}
        canDelete={false}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="left"
        anchorPosition={{ x: 750, y: 550 }}
      />,
    );

    const menu = screen.getByRole("menu");
    expect(menu).toHaveStyle({ position: "fixed" });
    // Dado que x=750 + 176 > 800 - 16, debe ajustarse hacia la izquierda (800 - 16 = 784, 750 - 176 = 574)
    expect(menu.style.left).toBe("574px");
    // Dado que y=550 + 240 > 600 - 16, debe ajustarse hacia arriba (550 - 240 = 310)
    expect(menu.style.top).toBe("310px");
  });

  it("closes the menu on window scroll", () => {
    const onClose = vi.fn();
    render(
      <MessageOptionsMenu
        open={true}
        onClose={onClose}
        canReply={true}
        canForward={false}
        canEdit={false}
        canDelete={false}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="right"
      />,
    );

    fireEvent.scroll(window);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders reaction buttons when onSelectReaction is provided and triggers callback", () => {
    const onClose = vi.fn();
    const onSelectReaction = vi.fn();

    render(
      <MessageOptionsMenu
        open={true}
        onClose={onClose}
        canReply={true}
        canForward={false}
        canEdit={false}
        canDelete={false}
        onSelectReaction={onSelectReaction}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        align="right"
      />,
    );

    const heartBtn = screen.getByLabelText("Reaccionar con ❤️");
    expect(heartBtn).toBeInTheDocument();

    fireEvent.click(heartBtn);
    expect(onSelectReaction).toHaveBeenCalledWith("❤️");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
