import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForwardMessageModal } from "./ForwardMessageModal";
import type { Message } from "@/features/messages/types/message.types";
import type { Conversation } from "@/features/conversations/types/conversation.types";
import type { DirectoryUser } from "@/features/users/types/user.types";

const mockForward = vi.fn();
const mockUseForwardMessage = vi.fn();
vi.mock("@/features/messages/hooks/use-forward-message", () => ({
  useForwardMessage: () => mockUseForwardMessage(),
}));

const mockUseConversations = vi.fn();
vi.mock("@/features/conversations/hooks/use-conversations", () => ({
  useConversations: () => mockUseConversations(),
}));

const mockUseUsers = vi.fn();
vi.mock("@/features/users/hooks/use-users", () => ({
  useUsers: () => mockUseUsers(),
}));

const baseMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "u-1",
  type: "TEXT",
  content: "Mensaje a reenviar",
  replyToId: null,
  forwardedFromId: null,
  editedAt: null,
  deletedAt: null,
  deletedById: null,
  createdAt: "2026-09-09T10:00:00Z",
  sender: { id: "u-1", name: "Remitente", email: "rem@example.com", avatarFileId: null },
  files: [],
  receipts: [],
  replyTo: null,
  forwardedFrom: null,
};

const convOther: Conversation = {
  id: "conv-2",
  type: "PRIVATE",
  name: null,
  imageFileId: null,
  imageFile: null,
  createdById: "current-u",
  lastMessageId: null,
  lastMessageAt: "2026-09-09T08:00:00Z",
  lastMessageSenderId: null,
  createdAt: "2026-09-09T08:00:00Z",
  updatedAt: "2026-09-09T08:00:00Z",
  deletedAt: null,
  members: [
    {
      id: "m-1",
      conversationId: "conv-2",
      userId: "current-u",
      joinedAt: "2026-09-09T08:00:00Z",
      lastReadMessageId: null,
      lastReadAt: null,
      lastDeliveredMessageId: null,
      lastDeliveredAt: null,
      isAdmin: false,
      isPinned: false,
      isFavorite: false,
      user: { id: "current-u", name: "Yo", email: "me@example.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
    },
    {
      id: "m-2",
      conversationId: "conv-2",
      userId: "u-2",
      joinedAt: "2026-09-09T08:00:00Z",
      lastReadMessageId: null,
      lastReadAt: null,
      lastDeliveredMessageId: null,
      lastDeliveredAt: null,
      isAdmin: false,
      isPinned: false,
      isFavorite: false,
      user: { id: "u-2", name: "Carlos", email: "carlos@example.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
    },
  ],
};

const user3: DirectoryUser = {
  id: "u-3",
  name: "Ana Gomez",
  email: "ana@example.com",
  avatarFileId: null,
  avatarFile: null,
  status: "ACTIVE",
};

describe("ForwardMessageModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockForward.mockResolvedValue(1);
    mockUseForwardMessage.mockReturnValue({
      forward: mockForward,
      pending: false,
      error: null,
    });
    mockUseConversations.mockReturnValue({
      conversations: [convOther],
      status: "ready",
    });
    mockUseUsers.mockReturnValue({
      users: [user3],
      status: "ready",
    });
  });

  it("renderiza destinos disponibles y maneja selección y reenvío", async () => {
    const user = userEvent.setup();
    render(
      <ForwardMessageModal
        message={baseMessage}
        currentUserId="current-u"
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("heading", { name: "Reenviar mensaje" })).toBeInTheDocument();
    expect(screen.getByText("Mensajes guardados")).toBeInTheDocument();
    expect(screen.getByText("Carlos")).toBeInTheDocument();
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();

    // Seleccionar Carlos
    await user.click(screen.getByText("Carlos"));
    expect(screen.getByRole("button", { name: "Reenviar (1)" })).toBeInTheDocument();

    // Reenviar
    await user.click(screen.getByRole("button", { name: "Reenviar (1)" }));
    expect(mockForward).toHaveBeenCalledWith("msg-1", [{ conversationId: "conv-2" }]);
    expect(onClose).toHaveBeenCalled();
  });

  it("permite seleccionar 'Mensajes guardados' y destinatario de contactos", async () => {
    mockForward.mockResolvedValue(2);
    const user = userEvent.setup();
    render(
      <ForwardMessageModal
        message={baseMessage}
        currentUserId="current-u"
        onClose={onClose}
      />,
    );

    await user.click(screen.getByText("Mensajes guardados"));
    await user.click(screen.getByText("Ana Gomez"));

    expect(screen.getByRole("button", { name: "Reenviar (2)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reenviar (2)" }));

    expect(mockForward).toHaveBeenCalledWith("msg-1", ["self", { userId: "u-3" }]);
    expect(onClose).toHaveBeenCalled();
  });

  it("filtra por búsqueda y muestra 'Sin resultados' si no hay coincidencia", async () => {
    const user = userEvent.setup();
    render(
      <ForwardMessageModal
        message={baseMessage}
        currentUserId="current-u"
        onClose={onClose}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Buscar conversación");
    await user.type(searchInput, "NoExisteNadie");

    expect(screen.queryByText("Carlos")).not.toBeInTheDocument();
    expect(screen.queryByText("Ana Gomez")).not.toBeInTheDocument();
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("muestra error si falla la operación de forward", () => {
    mockUseForwardMessage.mockReturnValue({
      forward: mockForward,
      pending: false,
      error: "Error de red al reenviar",
    });

    render(
      <ForwardMessageModal
        message={baseMessage}
        currentUserId="current-u"
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Error de red al reenviar")).toBeInTheDocument();
  });

  it("cierra al hacer click en el botón cerrar", async () => {
    const user = userEvent.setup();
    render(
      <ForwardMessageModal
        message={baseMessage}
        currentUserId="current-u"
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
