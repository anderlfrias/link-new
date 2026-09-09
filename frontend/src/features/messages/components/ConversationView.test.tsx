import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationView } from "./ConversationView";
import type { Message } from "@/features/messages/types/message.types";
import type { Conversation } from "@/features/conversations/types/conversation.types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseConversation = vi.fn();
vi.mock("@/features/conversations/hooks/use-conversation", () => ({
  useConversation: () => mockUseConversation(),
}));

const mockUseMessages = vi.fn();
vi.mock("@/features/messages/hooks/use-messages", () => ({
  useMessages: () => mockUseMessages(),
}));

const mockUseTyping = vi.fn();
vi.mock("@/features/messages/hooks/use-typing", () => ({
  useTyping: () => mockUseTyping(),
}));

const mockUseMessageAttachments = vi.fn();
vi.mock("@/features/messages/hooks/use-message-attachments", () => ({
  useMessageAttachments: () => mockUseMessageAttachments(),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: () => ({
    allowMessageEdit: true,
    messageEditTimeLimitMinutes: 15,
    allowMessageDeleteForEveryone: true,
    messageDeleteForEveryoneTimeLimitMinutes: 15,
    allowStickersAndGifs: true,
  }),
}));

const mockConversation: Conversation = {
  id: "conv-1",
  type: "PRIVATE",
  name: null,
  imageFileId: null,
  imageFile: null,
  createdById: "u-1",
  lastMessageId: null,
  lastMessageAt: "2026-09-09T08:00:00Z",
  lastMessageSenderId: null,
  createdAt: "2026-09-09T08:00:00Z",
  updatedAt: "2026-09-09T08:00:00Z",
  deletedAt: null,
  members: [
    {
      id: "m-1",
      conversationId: "conv-1",
      userId: "u-1",
      joinedAt: "2026-09-09T08:00:00Z",
      lastReadMessageId: null,
      lastReadAt: null,
      lastDeliveredMessageId: null,
      lastDeliveredAt: null,
      isAdmin: false,
      isPinned: false,
      isFavorite: false,
      user: { id: "u-1", name: "Yo", email: "yo@example.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
    },
    {
      id: "m-2",
      conversationId: "conv-1",
      userId: "u-2",
      joinedAt: "2026-09-09T08:00:00Z",
      lastReadMessageId: null,
      lastReadAt: null,
      lastDeliveredMessageId: null,
      lastDeliveredAt: null,
      isAdmin: false,
      isPinned: false,
      isFavorite: false,
      user: { id: "u-2", name: "Dra. Maria", email: "maria@example.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
    },
  ],
};

const mockMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "u-2",
  type: "TEXT",
  content: "Hola doctor, ¿cómo está?",
  replyToId: null,
  forwardedFromId: null,
  editedAt: null,
  deletedAt: null,
  deletedById: null,
  createdAt: "2026-09-09T09:00:00Z",
  sender: { id: "u-2", name: "Dra. Maria", email: "maria@example.com", avatarFileId: null },
  files: [],
  receipts: [],
  replyTo: null,
  forwardedFrom: null,
};

describe("ConversationView", () => {
  const mockSend = vi.fn();
  const mockEdit = vi.fn();
  const mockRemove = vi.fn();
  const mockLoadMore = vi.fn();
  const mockNotifyTyping = vi.fn();
  const mockNotifyStopped = vi.fn();
  const mockAddFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: {
        token: "token-123",
        user: { internalUserId: "u-1", name: "Yo", email: "yo@example.com" },
      },
    });
    mockUseConversation.mockReturnValue({
      conversation: mockConversation,
      status: "ready",
    });
    mockUseMessages.mockReturnValue({
      messages: [mockMessage],
      status: "ready",
      hasMore: false,
      loadingMore: false,
      loadMore: mockLoadMore,
      send: mockSend,
      edit: mockEdit,
      remove: mockRemove,
    });
    mockUseTyping.mockReturnValue({
      typingUserIds: [],
      notifyTyping: mockNotifyTyping,
      notifyStopped: mockNotifyStopped,
    });
    mockUseMessageAttachments.mockReturnValue({
      attachments: [],
      addFiles: mockAddFiles,
      removeAttachment: vi.fn(),
      reset: vi.fn(),
      isUploading: false,
      fileIds: [],
      validationErrors: [],
      dismissValidationError: vi.fn(),
    });
  });

  it("muestra spinner de carga mientras se carga la conversación", () => {
    mockUseConversation.mockReturnValue({
      conversation: null,
      status: "loading",
    });

    const { container } = render(<ConversationView conversationId="conv-1" />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("muestra mensaje de error si falla la carga de la conversación", () => {
    mockUseConversation.mockReturnValue({
      conversation: null,
      status: "error",
    });

    render(<ConversationView conversationId="conv-1" />);
    expect(screen.getByText("No se pudo cargar la conversación.")).toBeInTheDocument();
  });

  it("renderiza encabezado, lista de mensajes y campo de entrada", () => {
    render(<ConversationView conversationId="conv-1" />);

    // Header muestra el nombre del otro usuario (Dra. Maria)
    expect(screen.getByText("Dra. Maria")).toBeInTheDocument();

    // Mensaje en la lista
    expect(screen.getByText("Hola doctor, ¿cómo está?")).toBeInTheDocument();

    // Input de mensaje
    expect(screen.getByPlaceholderText("Escribí un mensaje")).toBeInTheDocument();
  });

  it("muestra indicador de escribiendo en el header cuando otro usuario está escribiendo", () => {
    mockUseTyping.mockReturnValue({
      typingUserIds: ["u-2"],
      notifyTyping: mockNotifyTyping,
      notifyStopped: mockNotifyStopped,
    });

    render(<ConversationView conversationId="conv-1" />);
    expect(screen.getByText("Dra. Maria escribiendo...")).toBeInTheDocument();
  });

  it("abre el panel de detalles de la conversación al hacer click en el botón de info", async () => {
    const user = userEvent.setup();
    render(<ConversationView conversationId="conv-1" />);

    const detailsBtn = screen.getByRole("button", { name: "Ver información de Dra. Maria" });
    await user.click(detailsBtn);

    // Debe abrir el Drawer con el título "Info del contacto"
    expect(screen.getByRole("heading", { name: "Info del contacto" })).toBeInTheDocument();
  });

  it("envía mensaje y limpia el input", async () => {
    const user = userEvent.setup();
    render(<ConversationView conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    await user.type(textarea, "¡Hola María! Todo bien.{Enter}");

    expect(mockSend).toHaveBeenCalledWith("¡Hola María! Todo bien.", undefined, undefined, undefined);
  });

  it("adjunta una imagen al disparar el evento de pegado global en la conversación", () => {
    render(<ConversationView conversationId="conv-1" />);

    const mockImageFile = new File(["bytes"], "foto.png", { type: "image/png" });
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => mockImageFile,
          },
        ],
        files: [],
      },
    });

    fireEvent(window, pasteEvent);

    expect(mockAddFiles).toHaveBeenCalledTimes(1);
    expect(mockAddFiles).toHaveBeenCalledWith([expect.objectContaining({
      name: "foto.png",
      type: "image/png",
    })]);
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it("adjunta un archivo (ej. PDF) al disparar el evento de pegado global en la conversación", () => {
    render(<ConversationView conversationId="conv-1" />);

    const mockPdfFile = new File(["bytes"], "contrato.pdf", { type: "application/pdf" });
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "application/pdf",
            getAsFile: () => mockPdfFile,
          },
        ],
        files: [],
      },
    });

    fireEvent(window, pasteEvent);

    expect(mockAddFiles).toHaveBeenCalledTimes(1);
    expect(mockAddFiles).toHaveBeenCalledWith([expect.objectContaining({
      name: "contrato.pdf",
      type: "application/pdf",
    })]);
    expect(pasteEvent.defaultPrevented).toBe(true);
  });
});

