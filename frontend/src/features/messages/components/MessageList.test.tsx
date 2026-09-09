import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { Message } from "@/features/messages/types/message.types";

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: () => ({
    allowMessageEdit: true,
    messageEditTimeLimitMinutes: 15,
    allowMessageDeleteForEveryone: true,
    messageDeleteForEveryoneTimeLimitMinutes: 15,
  }),
}));

const mockMessages: Message[] = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-1",
    type: "TEXT",
    content: "Primer mensaje",
    replyToId: null,
    forwardedFromId: null,
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: "2026-09-09T09:00:00Z",
    sender: { id: "user-1", name: "Remitente 1", email: "r1@example.com", avatarFileId: null },
    files: [],
    receipts: [],
    replyTo: null,
    forwardedFrom: null,
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    senderId: "user-2",
    type: "TEXT",
    content: "Segundo mensaje respuesta",
    replyToId: null,
    forwardedFromId: null,
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: "2026-09-09T09:05:00Z",
    sender: { id: "user-2", name: "Remitente 2", email: "r2@example.com", avatarFileId: null },
    files: [],
    receipts: [],
    replyTo: null,
    forwardedFrom: null,
  },
];

describe("MessageList", () => {
  const onLoadMore = vi.fn();
  const onEditMessage = vi.fn();
  const onDeleteMessage = vi.fn();
  const onReplyMessage = vi.fn();
  const onForwardMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra spinner mientras status es loading o idle", () => {
    const { container } = render(
      <MessageList
        messages={[]}
        status="loading"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={false}
        loadingMore={false}
        onLoadMore={onLoadMore}
        isTyping={false}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("muestra mensaje de error cuando status es error", () => {
    render(
      <MessageList
        messages={[]}
        status="error"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={false}
        loadingMore={false}
        onLoadMore={onLoadMore}
        isTyping={false}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    expect(screen.getByText("No se pudieron cargar los mensajes.")).toBeInTheDocument();
  });

  it("muestra empty state cuando no hay mensajes", () => {
    render(
      <MessageList
        messages={[]}
        status="ready"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={false}
        loadingMore={false}
        onLoadMore={onLoadMore}
        isTyping={false}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    expect(screen.getByText("Todavía no hay mensajes. Escribí el primero.")).toBeInTheDocument();
  });

  it("renderiza lista de mensajes, inicio de conversación y separador de fecha", () => {
    render(
      <MessageList
        messages={mockMessages}
        status="ready"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={false}
        loadingMore={false}
        onLoadMore={onLoadMore}
        isTyping={false}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    expect(screen.getByText("Inicio de la conversación")).toBeInTheDocument();
    expect(screen.getByText("Primer mensaje")).toBeInTheDocument();
    expect(screen.getByText("Segundo mensaje respuesta")).toBeInTheDocument();
  });

  it("muestra indicador de cargando más cuando loadingMore es true", () => {
    render(
      <MessageList
        messages={mockMessages}
        status="ready"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={true}
        loadingMore={true}
        onLoadMore={onLoadMore}
        isTyping={false}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    expect(screen.getByText("Cargando mensajes anteriores...")).toBeInTheDocument();
  });

  it("muestra TypingIndicator cuando isTyping es true", () => {
    const { container } = render(
      <MessageList
        messages={mockMessages}
        status="ready"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={false}
        loadingMore={false}
        onLoadMore={onLoadMore}
        isTyping={true}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    expect(container.querySelector(".animate-bounce")).toBeInTheDocument();
  });
});
