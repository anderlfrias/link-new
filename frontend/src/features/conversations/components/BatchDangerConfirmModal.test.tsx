import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchDangerConfirmModal } from "./BatchDangerConfirmModal";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

const mockPrivateConv: ConversationListItem = {
  id: "conv-1",
  name: "Carlos",
  type: "PRIVATE",
  imageFileId: null,
  imageFile: null,
  createdById: "u-1",
  lastMessageId: null,
  lastMessageAt: null,
  lastMessageSenderId: null,
  lastMessageStatus: null,
  lastMessagePreview: null,
  createdAt: "2026-09-09T08:00:00Z",
  updatedAt: "2026-09-09T08:00:00Z",
  deletedAt: null,
  members: [],
  unreadCount: 0,
  isPinnedByMe: false,
  isFavoritedByMe: false,
};

const mockGroupConv: ConversationListItem = {
  ...mockPrivateConv,
  id: "conv-group-1",
  name: "Grupo Proyecto",
  type: "GROUP",
};

describe("BatchDangerConfirmModal", () => {
  it("renderiza para salir de grupos correctamente", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <BatchDangerConfirmModal
        kind="leave"
        selectedConversations={[mockGroupConv]}
        pending={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("heading", { name: "Salir del grupo" })).toBeInTheDocument();
    expect(screen.getByText(/Dejarás de ser miembro de este grupo/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salir del grupo" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renderiza para eliminar múltiples chats privados", () => {
    render(
      <BatchDangerConfirmModal
        kind="delete"
        selectedConversations={[mockPrivateConv, { ...mockPrivateConv, id: "conv-2" }]}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("¿Eliminar 2 chats?")).toBeInTheDocument();
    expect(screen.getByText(/Se eliminarán estas 2 conversaciones de tu lista/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar 2 chats" })).toBeInTheDocument();
  });

  it("renderiza para eliminar múltiples grupos", () => {
    render(
      <BatchDangerConfirmModal
        kind="delete"
        selectedConversations={[mockGroupConv, { ...mockGroupConv, id: "conv-group-2" }]}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("¿Eliminar 2 grupos?")).toBeInTheDocument();
    expect(screen.getByText(/Los 2 grupos se eliminarán definitivamente/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar 2 grupos" })).toBeInTheDocument();
  });

  it("renderiza para eliminar una selección mixta", () => {
    render(
      <BatchDangerConfirmModal
        kind="delete"
        selectedConversations={[mockPrivateConv, mockGroupConv]}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("¿Eliminar 2 conversaciones?")).toBeInTheDocument();
    expect(screen.getByText(/Se eliminarán 1 chats? de tu lista y 1 grupos? de forma definitiva/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar 2 conversaciones" })).toBeInTheDocument();
  });

  it("muestra mensaje de error si está presente", () => {
    render(
      <BatchDangerConfirmModal
        kind="delete"
        selectedConversations={[mockPrivateConv]}
        pending={false}
        error="Error al procesar la eliminación"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Error al procesar la eliminación")).toBeInTheDocument();
  });
});
