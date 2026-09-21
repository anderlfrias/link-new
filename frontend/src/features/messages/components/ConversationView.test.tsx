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

const mockCopyTextToClipboard = vi.fn().mockResolvedValue(true);
vi.mock("@/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/clipboard")>();
  return {
    ...actual,
    copyTextToClipboard: (...args: any[]) => mockCopyTextToClipboard(...args),
  };
});

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

  it("abre el buscador al hacer clic en el botón de búsqueda del header y busca coincidencias", async () => {
    const user = userEvent.setup();
    render(<ConversationView conversationId="conv-1" />);

    const searchBtn = screen.getByRole("button", { name: "Buscar en el chat" });
    await user.click(searchBtn);

    const input = screen.getByPlaceholderText("Buscar en la conversación...");
    expect(input).toBeInTheDocument();

    await user.type(input, "doctor");
    expect(screen.getByText("1 de 1")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Cerrar búsqueda" });
    await user.click(closeBtn);
    expect(screen.queryByPlaceholderText("Buscar en la conversación...")).not.toBeInTheDocument();
  });

  it("abre el buscador al presionar la combinación de teclas Ctrl+F", async () => {
    render(<ConversationView conversationId="conv-1" />);

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(screen.getByPlaceholderText("Buscar en la conversación...")).toBeInTheDocument();
  });

  it("no despliega sugerencias de mención al escribir @ en una conversación privada", async () => {
    const user = userEvent.setup();
    render(<ConversationView conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    await user.type(textarea, "Hola @");

    expect(screen.queryByTestId("mention-autocomplete-list")).not.toBeInTheDocument();
  });

  it("despliega sugerencias de mención con @usuario al escribir @ en un grupo", async () => {
    const user = userEvent.setup();
    mockUseConversation.mockReturnValue({
      conversation: {
        ...mockConversation,
        id: "group-1",
        type: "GROUP",
        name: "Equipo Médico",
        members: [
          ...mockConversation.members,
          {
            id: "m-3",
            conversationId: "group-1",
            userId: "u-3",
            joinedAt: "2026-09-09T08:00:00Z",
            lastReadMessageId: null,
            lastReadAt: null,
            lastDeliveredMessageId: null,
            lastDeliveredAt: null,
            isAdmin: false,
            isPinned: false,
            isFavorite: false,
            user: {
              id: "u-3",
              name: "Carlos Sanchez",
              username: "csanchez",
              email: "csanchez@example.com",
              avatarFileId: null,
              avatarFile: null,
              status: "ACTIVE",
            },
          },
        ],
      },
      status: "ready",
    });

    render(<ConversationView conversationId="group-1" />);

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    await user.type(textarea, "Hola @");

    expect(screen.getByTestId("mention-autocomplete-list")).toBeInTheDocument();
    expect(screen.getByText("@csanchez")).toBeInTheDocument();
    expect(screen.queryByText("Carlos Sanchez")).not.toBeInTheDocument();
  });

  it("permite entrar en modo selección desde las opciones del mensaje y copiar mensajes seleccionados", async () => {
    const user = userEvent.setup();
    const ownMessage: Message = {
      ...mockMessage,
      id: "msg-own",
      senderId: "u-1",
      content: "Mi mensaje para copiar",
      createdAt: new Date().toISOString(),
    };

    mockUseMessages.mockReturnValue({
      messages: [mockMessage, ownMessage],
      status: "ready",
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      send: vi.fn(),
      edit: vi.fn(),
      remove: vi.fn(),
      toggleReaction: vi.fn(),
    });

    render(<ConversationView conversationId="conv-1" />);

    // Abrir menú de opciones del primer mensaje
    const menuButtons = screen.getAllByRole("button", { name: "Opciones del mensaje" });
    await user.click(menuButtons[0]);

    // Elegir 'Seleccionar'
    const selectOption = screen.getByRole("menuitem", { name: "Seleccionar" });
    await user.click(selectOption);

    // Debe activarse la barra de herramientas con 1 seleccionado
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    // Seleccionar el segundo mensaje
    const checkboxes = screen.getAllByRole("button", { name: "Seleccionar mensaje" });
    await user.click(checkboxes[0]); // Hace click en el segundo mensaje

    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();

    // Copiar mensajes seleccionados
    const copyBtn = screen.getByLabelText("Copiar mensajes");
    await user.click(copyBtn);

    expect(mockCopyTextToClipboard).toHaveBeenCalled();
    // Vuelve al header normal tras copiar
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument();
  });

  it("permite eliminar mensajes seleccionados desde la barra de selección", async () => {
    const user = userEvent.setup();
    const ownMessage: Message = {
      ...mockMessage,
      id: "msg-own",
      senderId: "u-1",
      content: "Mensaje propio a eliminar",
      createdAt: new Date().toISOString(),
    };

    mockUseMessages.mockReturnValue({
      messages: [ownMessage],
      status: "ready",
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      send: vi.fn(),
      edit: vi.fn(),
      remove: mockRemove,
      toggleReaction: vi.fn(),
    });

    render(<ConversationView conversationId="conv-1" />);

    // Abrir menú de opciones y seleccionar
    const menuButton = screen.getByRole("button", { name: "Opciones del mensaje" });
    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "Seleccionar" }));

    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    // Hacer clic en eliminar
    const deleteToolbarBtn = screen.getByLabelText("Eliminar mensajes");
    await user.click(deleteToolbarBtn);

    // Modal de confirmación debe abrirse
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /Eliminar para todos/i });
    await user.click(confirmBtn);

    expect(mockRemove).toHaveBeenCalledWith("msg-own");
  });

  it("sale del modo selección al hacer clic en el botón cerrar [X]", async () => {
    const user = userEvent.setup();
    render(<ConversationView conversationId="conv-1" />);

    const menuButton = screen.getByRole("button", { name: "Opciones del mensaje" });
    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "Seleccionar" }));

    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    // Cerrar selección
    const closeBtn = screen.getByLabelText("Cerrar selección");
    await user.click(closeBtn);

    expect(screen.queryByText("1 seleccionado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver información de Dra. Maria/i })).toBeInTheDocument();
  });

  it("no permite seleccionar mensajes eliminados ni reenviarlos", async () => {
    const user = userEvent.setup();
    const deletedMessage: Message = {
      ...mockMessage,
      id: "msg-del",
      content: "",
      deletedAt: "2026-09-09T09:05:00Z",
    };

    mockUseMessages.mockReturnValue({
      messages: [mockMessage, deletedMessage],
      status: "ready",
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      send: vi.fn(),
      edit: vi.fn(),
      remove: vi.fn(),
      toggleReaction: vi.fn(),
    });

    render(<ConversationView conversationId="conv-1" />);

    // El mensaje eliminado muestra "Mensaje eliminado"
    expect(screen.getByText("Mensaje eliminado")).toBeInTheDocument();

    // Solo el mensaje válido tiene botón de opciones
    const menuButtons = screen.getAllByRole("button", { name: "Opciones del mensaje" });
    expect(menuButtons).toHaveLength(1);
    await user.click(menuButtons[0]);
    await user.click(screen.getByRole("menuitem", { name: "Seleccionar" }));

    // El modo selección está activo
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    // El eliminado no tiene botón para ser seleccionado
    expect(screen.queryByRole("button", { name: "Seleccionar mensaje" })).not.toBeInTheDocument();

    // El botón de reenviar está habilitado porque solo el mensaje válido está seleccionado
    const forwardBtn = screen.getByLabelText("Reenviar mensajes");
    expect(forwardBtn).toBeEnabled();
  });
});


