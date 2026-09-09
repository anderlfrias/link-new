import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../conversations/conversation.repository", () => ({
  isConversationMember: vi.fn(),
}));

vi.mock("../../socket/rooms", () => ({
  conversationRoomName: vi.fn((id) => `conversation:${id}`),
}));

import { isConversationMember } from "../conversations/conversation.repository";
import { conversationRoomName } from "../../socket/rooms";
import { SOCKET_LIFECYCLE_EVENTS } from "../../socket/events";
import { MESSAGE_EVENTS, registerMessageSocket } from "./message.socket";

function createMockSocket(userData?: any) {
  const listeners: Record<string, Function> = {};
  const mockEmit = vi.fn();
  const mockTo = vi.fn(() => ({ emit: mockEmit }));

  return {
    data: { user: userData },
    on: vi.fn((event: string, handler: Function) => {
      listeners[event] = handler;
    }),
    to: mockTo,
    mockEmit,
    trigger: (event: string, ...args: any[]) => listeners[event]?.(...args),
  } as any;
}

describe("message.socket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra los eventos TYPING_START, TYPING_STOP y DISCONNECTING", () => {
    const socket = createMockSocket();
    registerMessageSocket(socket, {} as any);

    expect(socket.on).toHaveBeenCalledWith(MESSAGE_EVENTS.TYPING_START, expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith(MESSAGE_EVENTS.TYPING_STOP, expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith(SOCKET_LIFECYCLE_EVENTS.DISCONNECTING, expect.any(Function));
  });

  describe("relayTyping", () => {
    it("no retransmite evento si el socket no está autenticado", async () => {
      const socket = createMockSocket(undefined);
      registerMessageSocket(socket, {} as any);

      await socket.trigger(MESSAGE_EVENTS.TYPING_START, "conv-1");

      expect(isConversationMember).not.toHaveBeenCalled();
      expect(socket.to).not.toHaveBeenCalled();
    });

    it("no retransmite evento si el usuario no es miembro de la conversación", async () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerMessageSocket(socket, {} as any);
      vi.mocked(isConversationMember).mockResolvedValue(false);

      await socket.trigger(MESSAGE_EVENTS.TYPING_START, "conv-1");

      expect(isConversationMember).toHaveBeenCalledWith("conv-1", "u-1");
      expect(socket.to).not.toHaveBeenCalled();
    });

    it("retransmite TYPING_START a la sala de la conversación si es miembro", async () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerMessageSocket(socket, {} as any);
      vi.mocked(isConversationMember).mockResolvedValue(true);

      await socket.trigger(MESSAGE_EVENTS.TYPING_START, "conv-1");

      expect(socket.to).toHaveBeenCalledWith("conversation:conv-1");
      expect(socket.mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.TYPING_START, {
        conversationId: "conv-1",
        userId: "u-1",
      });
    });

    it("retransmite TYPING_STOP al recibir el evento", async () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerMessageSocket(socket, {} as any);
      vi.mocked(isConversationMember).mockResolvedValue(true);

      await socket.trigger(MESSAGE_EVENTS.TYPING_STOP, "conv-1");

      expect(socket.to).toHaveBeenCalledWith("conversation:conv-1");
      expect(socket.mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.TYPING_STOP, {
        conversationId: "conv-1",
        userId: "u-1",
      });
    });

    it("al desconectarse emite TYPING_STOP para todas las conversaciones pendientes", async () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerMessageSocket(socket, {} as any);
      vi.mocked(isConversationMember).mockResolvedValue(true);

      // Inicia typing en dos conversaciones
      await socket.trigger(MESSAGE_EVENTS.TYPING_START, "conv-1");
      await socket.trigger(MESSAGE_EVENTS.TYPING_START, "conv-2");

      socket.to.mockClear();
      socket.mockEmit.mockClear();

      // Se desconecta antes de enviar TYPING_STOP
      await socket.trigger(SOCKET_LIFECYCLE_EVENTS.DISCONNECTING);

      expect(socket.to).toHaveBeenCalledWith("conversation:conv-1");
      expect(socket.to).toHaveBeenCalledWith("conversation:conv-2");
      expect(socket.mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.TYPING_STOP, {
        conversationId: "conv-1",
        userId: "u-1",
      });
      expect(socket.mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.TYPING_STOP, {
        conversationId: "conv-2",
        userId: "u-1",
      });
    });
  });
});
