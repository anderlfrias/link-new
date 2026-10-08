import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "@/features/messages/components/MessageInput";
import { useMessages } from "@/features/messages/hooks/use-messages";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";
import { sendMessage, listMessages } from "@/features/messages/api/messages.api";
import { markConversationRead } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";
import type { Message } from "@/features/messages/types/message.types";

const mockSession = createMockSession({
  token: "tok-test",
  user: {
    id: "u-1",
    internalUserId: "u-1",
    username: "doctor",
    fullName: "Dr. Gomez",
    email: "gomez@example.com",
    roles: ["USER"],
    exp: 9999999999,
    notificationSoundEnabled: true,
  },
});

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ session: mockSession, status: "authenticated" }),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: () => ({
    settings: {
      maxUploadSizeMb: 25,
      maxVoiceNoteDurationSeconds: 120,
      maxFilesPerMessage: 10,
      allowStickersAndGifs: false,
    },
  }),
}));

vi.mock("@/providers/socket-provider", () => ({
  useSocket: () => ({
    socket: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  }),
}));

vi.mock("@/features/messages/api/messages.api", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  markConversationRead: vi.fn(),
}));

function ConnectedMessageComposer({ conversationId }: { conversationId: string }) {
  const { messages, send } = useMessages(conversationId);
  const attachmentsState = useMessageAttachments(conversationId);

  return (
    <div>
      <ul data-testid="messages-list">
        {messages.map((m) => (
          <li key={m.id}>{m.content}</li>
        ))}
      </ul>
      <MessageInput
        conversationId={conversationId}
        onSend={(content, fileIds, type) => send(content, fileIds, undefined, type)}
        onTyping={() => {}}
        onStopTyping={() => {}}
        attachmentsState={attachmentsState}
        replyTo={null}
        onCancelReply={() => {}}
        currentUserId="u-1"
      />
    </div>
  );
}

describe("Flujo clave: Enviar un mensaje", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMessages).mockResolvedValue([]);
    vi.mocked(markConversationRead).mockResolvedValue();
  });

  it("MessageInput -> use-messages.ts -> llama a messages.api.ts con payload y actualiza la lista", async () => {
    const user = userEvent.setup();
    const createdMsg: Message = {
      id: "msg-created-1",
      conversationId: "conv-100",
      senderId: "u-1",
      content: "Reporte de guardia listo",
      type: "TEXT",
      editedAt: null,
      deletedAt: null,
      deletedById: null,
      replyToId: null,
      replyTo: null,
      forwardedFromId: null,
      forwardedFrom: null,
      sender: {
        id: "u-1",
        name: "Dr. Gomez",
        email: "gomez@example.com",
        avatarFileId: null,
      },
      files: [],
      receipts: [],
      createdAt: new Date().toISOString(),
    };

    vi.mocked(sendMessage).mockResolvedValueOnce(createdMsg);

    render(<ConnectedMessageComposer conversationId="conv-100" />);

    // Espera carga inicial de useMessages
    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith("tok-test", "conv-100", { limit: 50 });
    });

    // Escribir mensaje en MessageInput
    const textarea = screen.getByPlaceholderText("Escribí un mensaje");
    await user.type(textarea, "Reporte de guardia listo");

    // Click en botón enviar
    const sendBtn = screen.getByRole("button", { name: "Enviar mensaje" });
    await user.click(sendBtn);

    // Verifica que messages.api.sendMessage fue llamado con el payload correcto
    expect(sendMessage).toHaveBeenCalledWith("tok-test", "conv-100", {
      content: "Reporte de guardia listo",
      fileIds: undefined,
      replyToId: undefined,
      type: undefined,
    });

    // Verifica que useMessages actualizó el estado en vivo con el nuevo mensaje
    await waitFor(() => {
      expect(screen.getByText("Reporte de guardia listo")).toBeInTheDocument();
    });

    // El input quedó limpio
    expect(textarea).toHaveValue("");
  });
});
