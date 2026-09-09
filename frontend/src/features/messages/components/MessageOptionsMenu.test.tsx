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
});
