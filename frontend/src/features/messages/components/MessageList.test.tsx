import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("posiciona scrollTop al valor de scrollHeight al estar en estado ready", () => {
    let assignedScrollTop = 0;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTop",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get: () => assignedScrollTop,
      set: (val) => {
        assignedScrollTop = val;
      },
    });

    try {
      render(
        <MessageList
          conversationId="conv-test-1"
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

      expect(assignedScrollTop).toBe(1200);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      }
      if (originalScrollTop) {
        Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
      }
    }
  });

  it("reinicia posición y vuelve al fondo cuando cambia conversationId", () => {
    let assignedScrollTop = 0;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTop",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get: () => assignedScrollTop,
      set: (val) => {
        assignedScrollTop = val;
      },
    });

    try {
      const { rerender } = render(
        <MessageList
          conversationId="conv-1"
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

      expect(assignedScrollTop).toBe(800);

      // Simular cambio a otra conversación
      rerender(
        <MessageList
          conversationId="conv-2"
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

      expect(assignedScrollTop).toBe(800);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      }
      if (originalScrollTop) {
        Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
      }
    }
  });

  it("no dispara onLoadMore en la carga inicial aunque scrollTop sea 0", () => {
    const { container } = render(
      <MessageList
        conversationId="conv-test"
        messages={mockMessages}
        status="ready"
        currentUserId="user-1"
        conversationType="PRIVATE"
        hasMore={true}
        loadingMore={false}
        onLoadMore={onLoadMore}
        isTyping={false}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onForwardMessage={onForwardMessage}
      />,
    );

    const scrollContainer = container.querySelector(".overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();

    // onLoadMore no debe haberse llamado al montar
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("dispara onLoadMore cuando el usuario se desplaza hacia arriba superando el umbral", () => {
    let assignedScrollTop = 500;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTop",
    );
    const originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get: () => assignedScrollTop,
      set: (val) => {
        assignedScrollTop = val;
      },
    });

    try {
      const { container } = render(
        <MessageList
          conversationId="conv-test"
          messages={mockMessages}
          status="ready"
          currentUserId="user-1"
          conversationType="PRIVATE"
          hasMore={true}
          loadingMore={false}
          onLoadMore={onLoadMore}
          isTyping={false}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          onReplyMessage={onReplyMessage}
          onForwardMessage={onForwardMessage}
        />,
      );

      const scrollContainer = container.querySelector(".overflow-y-auto")!;

      // Simular que ya se asentó el scroll inicial al fondo (ej. scrollTop estaba en 600)
      assignedScrollTop = 600;
      fireEvent.scroll(scrollContainer);

      // Ahora el usuario scrollea hacia arriba cerca del tope (scrollTop = 80)
      assignedScrollTop = 80;
      fireEvent.scroll(scrollContainer);

      expect(onLoadMore).toHaveBeenCalled();
    } finally {
      if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      if (originalScrollTop) Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
  });

  it("mantiene el scroll clavado al fondo cuando cargan imágenes y el usuario no subió", () => {
    let assignedScrollTop = 0;
    let currentScrollHeight = 800;

    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTop",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => currentScrollHeight,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get: () => assignedScrollTop,
      set: (val) => {
        assignedScrollTop = val;
      },
    });

    try {
      const { container } = render(
        <MessageList
          conversationId="conv-test"
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

      expect(assignedScrollTop).toBe(800);

      // Ahora simular que una imagen termina de cargar y expande el scrollHeight a 1600
      currentScrollHeight = 1600;
      const contentEl = container.querySelector(".space-y-2")!;
      // Disparar evento load en fase de captura tal como una imagen cargando
      fireEvent.load(contentEl);

      expect(assignedScrollTop).toBe(1600);
    } finally {
      if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      if (originalScrollTop) Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
    }
  });
});
