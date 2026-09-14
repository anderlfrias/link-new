import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "./MessageInput";
import type { Message } from "@/features/messages/types/message.types";

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUsePublicSettings = vi.fn();
vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: () => mockUsePublicSettings(),
}));

const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn();
const mockCancelRecording = vi.fn();
let mockRecorderStatus: "idle" | "recording" | "error" = "idle";
vi.mock("@/features/messages/hooks/use-voice-recorder", () => ({
  useVoiceRecorder: () => ({
    status: mockRecorderStatus,
    elapsedMs: 3000,
    start: mockStartRecording,
    stop: mockStopRecording,
    cancel: mockCancelRecording,
  }),
}));

const mockUploadFile = vi.fn();
vi.mock("@/features/files/api/files.api", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

const mockImportGiphyAsset = vi.fn();
vi.mock("@/features/giphy/api/giphy.api", () => ({
  importGiphyAsset: (...args: unknown[]) => mockImportGiphyAsset(...args),
}));

const sampleReplyMessage: Message = {
  id: "reply-msg-1",
  conversationId: "conv-1",
  senderId: "other-user",
  type: "TEXT",
  content: "Texto citado original",
  replyToId: null,
  forwardedFromId: null,
  editedAt: null,
  deletedAt: null,
  deletedById: null,
  createdAt: "2026-09-09T10:00:00Z",
  sender: { id: "other-user", name: "Dra. Laura", email: "laura@example.com", avatarFileId: null },
  files: [],
  receipts: [],
  replyTo: null,
  forwardedFrom: null,
};

describe("MessageInput", () => {
  const onSend = vi.fn();
  const onTyping = vi.fn();
  const onStopTyping = vi.fn();
  const onCancelReply = vi.fn();

  let defaultAttachmentsState: {
    attachments: unknown[];
    addFiles: ReturnType<typeof vi.fn>;
    removeAttachment: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    isUploading: boolean;
    fileIds: string[];
    validationErrors: unknown[];
    dismissValidationError: ReturnType<typeof vi.fn>;
    resumableSession: unknown;
    resumableMismatchError: unknown;
    resumeSessionWithFile: ReturnType<typeof vi.fn>;
    discardResumableSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecorderStatus = "idle";
    mockUseAuth.mockReturnValue({
      session: {
        token: "tok-123",
        user: { internalUserId: "current-u", name: "Yo", email: "yo@example.com" },
      },
    });
    mockUsePublicSettings.mockReturnValue({
      allowStickersAndGifs: true,
      maxUploadSizeMb: 50,
    });
    defaultAttachmentsState = {
      attachments: [],
      addFiles: vi.fn(),
      removeAttachment: vi.fn(),
      reset: vi.fn(),
      isUploading: false,
      fileIds: [],
      validationErrors: [],
      dismissValidationError: vi.fn(),
      resumableSession: null,
      resumableMismatchError: null,
      resumeSessionWithFile: vi.fn(),
      discardResumableSession: vi.fn(),
    };
  });

  it("escribe texto, notifica typing y envía mensaje con Enter", async () => {
    const user = userEvent.setup();
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    // Al inicio no hay texto, botón es el micrófono
    expect(screen.getByRole("button", { name: "Grabar nota de voz" })).toBeInTheDocument();

    await user.type(textarea, "Hola doctor");
    expect(onTyping).toHaveBeenCalled();

    // Con texto, aparece el botón de enviar
    const sendButton = screen.getByRole("button", { name: "Enviar mensaje" });
    expect(sendButton).toBeInTheDocument();

    await user.click(sendButton);
    expect(onSend).toHaveBeenCalledWith("Hola doctor", undefined);
    expect(onStopTyping).toHaveBeenCalled();
    expect(defaultAttachmentsState.reset).toHaveBeenCalled();
  });

  it("permite enviar presionando tecla Enter (sin Shift)", async () => {
    const user = userEvent.setup();
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    await user.type(textarea, "Texto a enviar{Enter}");

    expect(onSend).toHaveBeenCalledWith("Texto a enviar", undefined);
  });

  it("muestra previsualización de respuesta cuando replyTo no es null y permite cancelar", async () => {
    const user = userEvent.setup();
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={sampleReplyMessage}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    expect(screen.getByText("Dra. Laura")).toBeInTheDocument();
    expect(screen.getByText("Texto citado original")).toBeInTheDocument();

    const cancelReplyBtn = screen.getByRole("button", { name: "Cancelar respuesta" });
    await user.click(cancelReplyBtn);
    expect(onCancelReply).toHaveBeenCalled();
  });

  it("abre menú de adjuntos y permite seleccionar opciones", async () => {
    const user = userEvent.setup();
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const attachBtn = screen.getByRole("button", { name: "Adjuntar" });
    await user.click(attachBtn);

    expect(screen.getByRole("button", { name: /Foto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Video/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Audio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Documento/i })).toBeInTheDocument();
  });

  it("muestra interfaz de grabación de voz cuando status es recording", async () => {
    mockRecorderStatus = "recording";
    mockStopRecording.mockResolvedValue(new File(["audio-data"], "audio.webm", { type: "audio/webm" }));
    mockUploadFile.mockResolvedValue({ id: "file-audio-1" });

    const user = userEvent.setup();
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    expect(screen.getByText("Grabando nota de voz...")).toBeInTheDocument();
    const sendRecordingBtn = screen.getByRole("button", { name: "Enviar nota de voz" });
    await user.click(sendRecordingBtn);

    expect(mockStopRecording).toHaveBeenCalled();
    expect(mockUploadFile).toHaveBeenCalledWith("tok-123", expect.any(File), "conv-1");
    expect(onSend).toHaveBeenCalledWith("", ["file-audio-1"]);
  });

  it("muestra error de validación de adjuntos cuando existe validationError", async () => {
    const dismissFn = vi.fn();
    const attachmentsWithErr = {
      ...defaultAttachmentsState,
      validationErrors: [
        { id: "err-1", fileName: "pesado.mp4", reason: { kind: "size-limit" } },
      ],
      dismissValidationError: dismissFn,
    };

    const user = userEvent.setup();
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={attachmentsWithErr as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    expect(screen.getByText("Archivo demasiado grande")).toBeInTheDocument();
    const acceptBtn = screen.getByRole("button", { name: "Aceptar" });
    await user.click(acceptBtn);
    expect(dismissFn).toHaveBeenCalledWith("err-1");
  });

  it("adjunta automáticamente una imagen al pegar en el textarea", () => {
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    const mockImageFile = new File(["fake-image-bytes"], "captura.png", { type: "image/png" });

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

    fireEvent(textarea, pasteEvent);

    expect(defaultAttachmentsState.addFiles).toHaveBeenCalledTimes(1);
    expect(defaultAttachmentsState.addFiles).toHaveBeenCalledWith([expect.objectContaining({
      name: "captura.png",
      type: "image/png",
    })]);
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it("no intercepta el pegado en el textarea si solo contiene texto plano", () => {
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            kind: "string",
            type: "text/plain",
            getAsFile: () => null,
          },
        ],
        files: [],
      },
    });

    fireEvent(textarea, pasteEvent);

    expect(defaultAttachmentsState.addFiles).not.toHaveBeenCalled();
    expect(pasteEvent.defaultPrevented).toBe(false);
  });

  it("adjunta automáticamente cualquier tipo de archivo (ej. PDF) al pegar en el textarea", () => {
    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={defaultAttachmentsState as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    const mockPdfFile = new File(["fake-pdf-bytes"], "informe.pdf", { type: "application/pdf" });

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

    fireEvent(textarea, pasteEvent);

    expect(defaultAttachmentsState.addFiles).toHaveBeenCalledTimes(1);
    expect(defaultAttachmentsState.addFiles).toHaveBeenCalledWith([expect.objectContaining({
      name: "informe.pdf",
      type: "application/pdf",
    })]);
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it("permite enviar mensajes de texto mientras un adjunto se encuentra subiendo (§8.3)", async () => {
    const user = userEvent.setup();
    const uploadingAttachment = {
      localId: "att-uploading-1",
      file: new File([new Uint8Array(20 * 1024 * 1024)], "video.mp4", { type: "video/mp4" }),
      status: "uploading",
    };

    const attachmentsStateWithUploading = {
      ...defaultAttachmentsState,
      attachments: [uploadingAttachment],
      isUploading: true,
      fileIds: [],
      removeSentAttachments: vi.fn(),
    };

    render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={attachmentsStateWithUploading as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    const textarea = screen.getByPlaceholderText("Agregá un mensaje (opcional)");
    await user.type(textarea, "Texto mientras el video sigue subiendo");

    const sendButton = screen.getByRole("button", { name: "Enviar mensaje" });
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    expect(onSend).toHaveBeenCalledWith("Texto mientras el video sigue subiendo", undefined);
    // No debe abortar ni resetear la bandeja de adjuntos en curso
    expect(defaultAttachmentsState.reset).not.toHaveBeenCalled();
    expect(attachmentsStateWithUploading.removeSentAttachments).not.toHaveBeenCalled();
  });

  it("renderiza ResumableUploadBanner cuando hay una sesión previa y permite descartar o reanudar", async () => {
    const user = userEvent.setup();
    const resumeSessionWithFile = vi.fn();
    const discardResumableSession = vi.fn();

    const attachmentsStateWithResumable = {
      ...defaultAttachmentsState,
      resumableSession: {
        sessionId: "sess-resumable-1",
        conversationId: "conv-1",
        fileName: "clip-cirugia.mp4",
        fileSize: 45 * 1024 * 1024,
        fileType: "video/mp4",
        lastModified: 1700000000000,
        createdAt: Date.now() - 3600000,
      },
      resumableMismatchError: null,
      resumeSessionWithFile,
      discardResumableSession,
    };

    const { rerender } = render(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={attachmentsStateWithResumable as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );

    expect(screen.getByText("Subida interrumpida detectada")).toBeInTheDocument();
    expect(screen.getByText("clip-cirugia.mp4")).toBeInTheDocument();

    // Probar click en descartar
    const discardBtn = screen.getByRole("button", { name: "Descartar subida pendiente" });
    await user.click(discardBtn);
    expect(discardResumableSession).toHaveBeenCalled();

    // Probar reanudar seleccionando archivo
    const fileInput = screen.getByLabelText("Seleccionar archivo para reanudar");
    const matchingFile = new File([new Uint8Array(45 * 1024 * 1024)], "clip-cirugia.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [matchingFile] } });
    expect(resumeSessionWithFile).toHaveBeenCalledWith(matchingFile);

    // Si además hay mismatchError, debe mostrarlo
    rerender(
      <MessageInput
        conversationId="conv-1"
        onSend={onSend}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        attachmentsState={{
          ...attachmentsStateWithResumable,
          resumableMismatchError: "El archivo seleccionado no coincide con la subida pendiente.",
        } as any}
        replyTo={null}
        onCancelReply={onCancelReply}
        currentUserId="current-u"
      />,
    );
    expect(
      screen.getByText("El archivo seleccionado no coincide con la subida pendiente."),
    ).toBeInTheDocument();
  });
});


