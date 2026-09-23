import { beforeEach, describe, expect, it, vi } from "vitest";
import * as CallService from "./call.service";
import { CALL_EVENTS, registerCallSocket } from "./call.socket";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class extends Error {},
}));
vi.mock("../../socket/request-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../socket/request-context")>();
  return {
    ...actual,
    withRequestContext: (_s: any, fn: any) => fn,
  };
});
vi.mock("./call.service");
vi.mock("./call.repository");

describe("call.socket", () => {
  let mockSocket: any;
  let mockIo: any;
  let handlers: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};

    mockSocket = {
      data: {
        user: {
          internalUserId: "user-1",
          email: "user1@example.com",
        },
      },
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
      emit: vi.fn(),
    };

    mockIo = {
      to: vi.fn(() => ({
        emit: vi.fn(),
      })),
    };

    registerCallSocket(mockSocket, mockIo);
  });

  it("registra todos los eventos de llamada esperados", () => {
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.INITIATE, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.ACCEPT, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.REJECT, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.SIGNAL, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.END, expect.any(Function));
  });

  it("maneja call:initiate emitiendo outgoing e incoming", async () => {
    const mockCall = {
      id: "call-1",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      callerId: "user-1",
      receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      type: "AUDIO",
      status: "RINGING",
    };

    vi.mocked(CallService.initiateCall).mockResolvedValue({
      call: mockCall as any,
      isBusy: false,
    });

    const callback = vi.fn();
    await handlers[CALL_EVENTS.INITIATE](
      {
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        type: "AUDIO",
      },
      callback,
    );

    expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.OUTGOING, { call: mockCall });
    expect(mockIo.to).toHaveBeenCalledWith("user:6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(callback).toHaveBeenCalledWith({ ok: true, call: mockCall });
  });

  it("maneja call:accept notificando a ambas partes", async () => {
    const mockCall = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      callerId: "caller-user",
      receiverId: "user-1",
      status: "ACCEPTED",
    };

    vi.mocked(CallService.acceptCall).mockResolvedValue(mockCall as any);

    const callback = vi.fn();
    await handlers[CALL_EVENTS.ACCEPT](
      { callId: "550e8400-e29b-41d4-a716-446655440000" },
      callback,
    );

    expect(mockIo.to).toHaveBeenCalledWith("user:caller-user");
    expect(mockIo.to).toHaveBeenCalledWith("user:user-1");
    expect(callback).toHaveBeenCalledWith({ ok: true, call: mockCall });
  });

  it("maneja call:signal retransmitiendo al targetUserId", async () => {
    const emitSpy = vi.fn();
    mockIo.to.mockReturnValue({ emit: emitSpy });

    await handlers[CALL_EVENTS.SIGNAL]({
      callId: "550e8400-e29b-41d4-a716-446655440000",
      targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      signal: { type: "offer", sdp: "abc" },
    });

    expect(mockIo.to).toHaveBeenCalledWith("user:6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(emitSpy).toHaveBeenCalledWith(CALL_EVENTS.SIGNAL, {
      callId: "550e8400-e29b-41d4-a716-446655440000",
      senderUserId: "user-1",
      signal: { type: "offer", sdp: "abc" },
    });
  });

  it("maneja call:end notificando el fin a ambas partes", async () => {
    const mockCall = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      callerId: "caller-user",
      receiverId: "user-1",
      status: "COMPLETED",
    };

    vi.mocked(CallService.endCall).mockResolvedValue(mockCall as any);

    const callback = vi.fn();
    await handlers[CALL_EVENTS.END]({ callId: "550e8400-e29b-41d4-a716-446655440000" }, callback);

    expect(mockIo.to).toHaveBeenCalledWith("user:caller-user");
    expect(mockIo.to).toHaveBeenCalledWith("user:user-1");
    expect(callback).toHaveBeenCalledWith({ ok: true, call: mockCall });
  });
});
