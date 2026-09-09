import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/features/messages/types/message.types";

const mockUsePublicSettings = vi.fn();
vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: () => mockUsePublicSettings(),
}));

const baseMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "user-1",
  type: "TEXT",
  content: "Mensaje original",
  replyToId: null,
  forwardedFromId: null,
  editedAt: null,
  deletedAt: null,
  deletedById: null,
  createdAt: "2026-09-09T10:00:00Z",
  sender: { id: "user-1", name: "Usuario Uno", email: "uno@example.com", avatarFileId: null },
  files: [],
  receipts: [],
  replyTo: null,
  forwardedFrom: null,
};

describe("MessageBubble", () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onReply = vi.fn();
  const onForward = vi.fn();
  const onJumpToMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePublicSettings.mockReturnValue({
      allowMessageEdit: true,
      messageEditTimeLimitMinutes: null,
      allowMessageDeleteForEveryone: true,
      messageDeleteForEveryoneTimeLimitMinutes: null,
    });
  });

  it("INVARIANTE: mensaje eliminado muestra 'Mensaje eliminado' y nunca el contenido original", () => {
    const deletedMessage: Message = {
      ...baseMessage,
      content: "Contenido confidencial que fue borrado",
      deletedAt: "2026-09-09T10:05:00Z",
    };

    render(
      <MessageBubble
        message={deletedMessage}
        isOwn={false}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-2"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    expect(screen.getByText("Mensaje eliminado")).toBeInTheDocument();
    expect(screen.queryByText("Contenido confidencial que fue borrado")).not.toBeInTheDocument();
    // No debe mostrar botón de opciones
    expect(screen.queryByRole("button", { name: "Opciones del mensaje" })).not.toBeInTheDocument();
  });

  it("renderiza mensaje propio con hora y sin remitente", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isOwn={true}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    expect(screen.getByText("Mensaje original")).toBeInTheDocument();
    expect(screen.queryByText("Usuario Uno")).not.toBeInTheDocument();
  });

  it("renderiza mensaje ajeno en grupo mostrando el remitente si showSender es true", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isOwn={false}
        showSender={true}
        isSelfChat={false}
        currentUserId="user-2"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    expect(screen.getByText("Usuario Uno")).toBeInTheDocument();
    expect(screen.getByText("Mensaje original")).toBeInTheDocument();
  });

  it("muestra badge de 'Reenviado' para mensaje reenviado común", () => {
    const forwardedMessage: Message = {
      ...baseMessage,
      forwardedFrom: {
        id: "msg-orig",
        senderId: "u-other",
        senderName: "Otro Usuario",
      },
    };

    render(
      <MessageBubble
        message={forwardedMessage}
        isOwn={false}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-2"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    expect(screen.getByText("Reenviado")).toBeInTheDocument();
  });

  it("muestra el nombre del remitente original cuando es chat SELF y reenviado de otro", () => {
    const forwardedMessage: Message = {
      ...baseMessage,
      forwardedFrom: {
        id: "msg-orig",
        senderId: "u-other",
        senderName: "Doctor Perez",
      },
    };

    render(
      <MessageBubble
        message={forwardedMessage}
        isOwn={true}
        showSender={false}
        isSelfChat={true}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    expect(screen.getByText("Doctor Perez")).toBeInTheDocument();
  });

  it("renderiza cita de mensaje previo (replyTo) y salta al hacer click", async () => {
    const user = userEvent.setup();
    const replyMessage: Message = {
      ...baseMessage,
      replyTo: {
        id: "msg-quoted-1",
        senderId: "user-2",
        senderName: "Juan",
        preview: "Texto citado original",
        deletedAt: null,
      },
    };

    render(
      <MessageBubble
        message={replyMessage}
        isOwn={true}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    expect(screen.getByText("Juan")).toBeInTheDocument();
    expect(screen.getByText("Texto citado original")).toBeInTheDocument();

    await user.click(screen.getByText("Texto citado original"));
    expect(onJumpToMessage).toHaveBeenCalledWith("msg-quoted-1");
  });

  it("permite abrir menú de opciones y disparar responder o reenviar", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={baseMessage}
        isOwn={false}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-2"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    const optionsBtn = screen.getByRole("button", { name: "Opciones del mensaje" });
    await user.click(optionsBtn);

    const replyBtn = screen.getByRole("menuitem", { name: "Responder" });
    await user.click(replyBtn);
    expect(onReply).toHaveBeenCalledWith(baseMessage);
  });

  it("permite editar el mensaje cuando canEdit es true", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={baseMessage}
        isOwn={true}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    // Abrir menú y elegir Editar
    await user.click(screen.getByRole("button", { name: "Opciones del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));

    // Aparece el textarea con el texto actual
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("Mensaje original");

    await user.clear(textarea);
    await user.type(textarea, "Mensaje editado nuevo");

    await user.click(screen.getByRole("button", { name: "Guardar edición" }));
    expect(onEdit).toHaveBeenCalledWith("msg-1", "Mensaje editado nuevo");
  });

  it("permite abrir modal de confirmación y eliminar el mensaje", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={baseMessage}
        isOwn={true}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Opciones del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Eliminar para todos" }));

    // Se abre el modal de confirmación
    expect(screen.getByRole("heading", { name: "Eliminar mensaje para todos" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar para todos" }));
    expect(onDelete).toHaveBeenCalledWith("msg-1");
  });

  it("renderiza imagen de sticker cuando type es STICKER", () => {
    const stickerMessage: Message = {
      ...baseMessage,
      type: "STICKER",
      files: [
        {
          id: "mf-1",
          messageId: "msg-1",
          fileId: "f-1",
          createdAt: "2026-09-09T10:00:00Z",
          file: {
            id: "f-1",
            path: "stickers/test.webp",
            originalName: "test.webp",
            mimeType: "image/webp",
            size: 1024,
            extension: "webp",
            provider: "LOCAL",
            checksum: null,
            createdById: "user-1",
            createdAt: "2026-09-09T10:00:00Z",
            deletedAt: null,
          },
        },
      ],
    };

    render(
      <MessageBubble
        message={stickerMessage}
        isOwn={true}
        showSender={false}
        isSelfChat={false}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={onReply}
        onForward={onForward}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    const img = screen.getByRole("img", { name: "Sticker" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", expect.stringContaining("stickers/test.webp"));
  });
});
