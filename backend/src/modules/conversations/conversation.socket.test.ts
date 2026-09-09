import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./conversation.repository", () => ({
  isConversationMember: vi.fn(),
}));

vi.mock("../../socket/rooms", () => ({
  joinConversation: vi.fn(),
  leaveConversation: vi.fn(),
}));

import { isConversationMember } from "./conversation.repository";
import { joinConversation, leaveConversation } from "../../socket/rooms";
import { CONVERSATION_EVENTS, registerConversationSocket } from "./conversation.socket";

function createMockSocket(userData?: any) {
  const listeners: Record<string, Function> = {};
  return {
    data: { user: userData },
    on: vi.fn((event: string, handler: Function) => {
      listeners[event] = handler;
    }),
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    // Helper para disparar el evento registrado
    trigger: (event: string, ...args: any[]) => listeners[event]?.(...args),
  } as any;
}

describe("conversation.socket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra los eventos JOIN y LEAVE en el socket", () => {
    const socket = createMockSocket();
    registerConversationSocket(socket, {} as any);

    expect(socket.on).toHaveBeenCalledWith(CONVERSATION_EVENTS.JOIN, expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith(CONVERSATION_EVENTS.LEAVE, expect.any(Function));
  });

  describe("handleJoin", () => {
    it("devuelve error si el socket no está autenticado", async () => {
      const socket = createMockSocket(undefined); // Sin usuario
      registerConversationSocket(socket, {} as any);

      const ack = vi.fn();
      await socket.trigger(CONVERSATION_EVENTS.JOIN, "conv-1", ack);

      expect(ack).toHaveBeenCalledWith({ ok: false, error: "Unauthenticated" });
      expect(joinConversation).not.toHaveBeenCalled();
    });

    it("devuelve error si el usuario autenticado no es miembro de la conversación", async () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerConversationSocket(socket, {} as any);
      vi.mocked(isConversationMember).mockResolvedValue(false);

      const ack = vi.fn();
      await socket.trigger(CONVERSATION_EVENTS.JOIN, "conv-1", ack);

      expect(isConversationMember).toHaveBeenCalledWith("conv-1", "u-1");
      expect(ack).toHaveBeenCalledWith({ ok: false, error: "Not a member of this conversation" });
      expect(joinConversation).not.toHaveBeenCalled();
    });

    it("une el socket a la sala y devuelve ok: true si es miembro", async () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerConversationSocket(socket, {} as any);
      vi.mocked(isConversationMember).mockResolvedValue(true);

      const ack = vi.fn();
      await socket.trigger(CONVERSATION_EVENTS.JOIN, "conv-1", ack);

      expect(isConversationMember).toHaveBeenCalledWith("conv-1", "u-1");
      expect(joinConversation).toHaveBeenCalledWith(socket, "conv-1");
      expect(ack).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("handleLeave", () => {
    it("saca al socket de la sala y ejecuta ack con ok: true", () => {
      const socket = createMockSocket({ internalUserId: "u-1" });
      registerConversationSocket(socket, {} as any);

      const ack = vi.fn();
      socket.trigger(CONVERSATION_EVENTS.LEAVE, "conv-1", ack);

      expect(leaveConversation).toHaveBeenCalledWith(socket, "conv-1");
      expect(ack).toHaveBeenCalledWith({ ok: true });
    });
  });
});
