import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/features/messages/types/message.types";

const mockUsePublicSettings = vi.fn();
vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: () => mockUsePublicSettings(),
}));

vi.mock("@/features/messages/providers/image-lightbox-provider", () => ({
  useImageLightbox: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false }),
}));

const mockCopyTextToClipboard = vi.fn();
const mockCopyImageToClipboard = vi.fn();
vi.mock("@/utils/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyTextToClipboard(...args),
  copyImageToClipboard: (...args: unknown[]) => mockCopyImageToClipboard(...args),
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
    mockCopyTextToClipboard.mockResolvedValue(true);
    mockCopyImageToClipboard.mockResolvedValue(true);
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
            url: "/uploads/stickers/test.webp",
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

  it("click derecho sobre un mensaje de texto abre el menú y permite copiar el texto al portapapeles", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

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

    fireEvent.contextMenu(screen.getByText("Mensaje original"));

    const copyBtn = screen.getByRole("menuitem", { name: "Copiar" });
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith("Mensaje original");
    expect(await screen.findByText("Texto copiado al portapapeles")).toBeInTheDocument();
  });

  it("click derecho sobre un mensaje con imagen muestra opción de copiar imagen y copia la imagen", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const imageMessage: Message = {
      ...baseMessage,
      content: "",
      files: [
        {
          id: "mf-img-1",
          messageId: "msg-1",
          fileId: "f-img-1",
          createdAt: "2026-09-09T10:00:00Z",
          file: {
            id: "f-img-1",
            url: "/uploads/chat/photo.jpg",
            path: "chat/photo.jpg",
            originalName: "foto.jpg",
            mimeType: "image/jpeg",
            size: 2048,
            extension: "jpg",
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
        message={imageMessage}
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

    const img = screen.getByRole("img", { name: "foto.jpg" });
    fireEvent.contextMenu(img);

    const copyImageBtn = screen.getByRole("menuitem", { name: "Copiar imagen" });
    expect(copyImageBtn).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Copiar$/i })).not.toBeInTheDocument();

    fireEvent.click(copyImageBtn);
    expect(mockCopyImageToClipboard).toHaveBeenCalledWith(expect.stringContaining("uploads/chat/photo.jpg"));
    expect(await screen.findByText("Imagen copiada al portapapeles")).toBeInTheDocument();
  });

  it("mensaje con texto Y foto muestra ambas opciones: 'Copiar texto' y 'Copiar imagen'", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const mixedMessage: Message = {
      ...baseMessage,
      content: "Foto del reporte mensual",
      files: [
        {
          id: "mf-img-2",
          messageId: "msg-1",
          fileId: "f-img-2",
          createdAt: "2026-09-09T10:00:00Z",
          file: {
            id: "f-img-2",
            url: "/uploads/chat/reporte.png",
            path: "chat/reporte.png",
            originalName: "reporte.png",
            mimeType: "image/png",
            size: 4096,
            extension: "png",
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
        message={mixedMessage}
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

    fireEvent.contextMenu(screen.getByText("Foto del reporte mensual"));

    const copyTextBtn = screen.getByRole("menuitem", { name: "Copiar texto" });
    const copyImageBtn = screen.getByRole("menuitem", { name: "Copiar imagen" });
    expect(copyTextBtn).toBeInTheDocument();
    expect(copyImageBtn).toBeInTheDocument();

    fireEvent.click(copyTextBtn);
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith("Foto del reporte mensual");
    expect(await screen.findByText("Texto copiado al portapapeles")).toBeInTheDocument();
  });

  it("click derecho sobre un sticker permite copiar la imagen del sticker", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const stickerMessage: Message = {
      ...baseMessage,
      type: "STICKER",
      content: "",
      files: [
        {
          id: "mf-1",
          messageId: "msg-1",
          fileId: "f-1",
          createdAt: "2026-09-09T10:00:00Z",
          file: {
            id: "f-1",
            url: "/uploads/stickers/test.webp",
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
    fireEvent.contextMenu(img);

    const copyImageBtn = screen.getByRole("menuitem", { name: "Copiar imagen" });
    expect(copyImageBtn).toBeInTheDocument();

    fireEvent.click(copyImageBtn);
    expect(mockCopyImageToClipboard).toHaveBeenCalledWith(expect.stringContaining("stickers/test.webp"));
    expect(await screen.findByText("Imagen copiada al portapapeles")).toBeInTheDocument();
  });

  it("renderiza enlaces interactivos para URLs, correos y teléfonos dentro del contenido del mensaje", () => {
    const messageWithLinks: Message = {
      ...baseMessage,
      id: "msg-links",
      content: "Consulta https://example.org, escribe a dr.perez@example.com o llama al (809) 588-4444.",
    };

    render(
      <MessageBubble
        message={messageWithLinks}
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

    const urlLink = screen.getByRole("link", { name: "https://example.org" });
    expect(urlLink).toBeInTheDocument();
    expect(urlLink).toHaveAttribute("href", "https://example.org");
    expect(urlLink).toHaveAttribute("target", "_blank");
    expect(urlLink).toHaveAttribute("rel", "noopener noreferrer");

    const emailLink = screen.getByRole("link", { name: "dr.perez@example.com" });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute("href", "mailto:dr.perez@example.com");

    const phoneLink = screen.getByRole("link", { name: "(809) 588-4444" });
    expect(phoneLink).toBeInTheDocument();
    expect(phoneLink).toHaveAttribute("href", "tel:8095884444");
  });
});

