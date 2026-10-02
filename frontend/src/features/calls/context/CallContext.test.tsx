import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallProvider, useCall } from "./CallContext";

const handlers = new Map<string, (payload: any) => unknown>();
const socket = {
  emit: vi.fn(),
  on: vi.fn((ev: string, h: (p: any) => unknown) => handlers.set(ev, h)),
  off: vi.fn((ev: string) => handlers.delete(ev)),
};

vi.mock("@/providers/socket-provider", () => ({ useSocket: () => ({ socket }) }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ session: { user: { internalUserId: "me" } } }),
}));
vi.mock("../utils/call-tones", () => ({
  playEndCallTone: vi.fn(),
  playIncomingRingtone: vi.fn(),
  playOutgoingRingtone: vi.fn(),
  stopAllTones: vi.fn(),
}));

class FakePC {
  static instances: FakePC[] = [];
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState = "new";
  signalingState = "stable";
  remoteDescription: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: unknown = null;
  onicecandidate: unknown = null;
  oniceconnectionstatechange: unknown = null;
  onicegatheringstatechange: unknown = null;
  onicecandidateerror: unknown = null;
  onsignalingstatechange: unknown = null;
  addTrack = vi.fn();
  close = vi.fn(() => {
    this.signalingState = "closed";
  });
  addTransceiver = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "x" }));
  setLocalDescription = vi.fn(async () => {});
  constructor() {
    FakePC.instances.push(this);
  }
  setState(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

const track = () => ({ stop: vi.fn(), enabled: true });
const call = { id: "c1", callerId: "me", receiverId: "peer", type: "AUDIO", status: "ACCEPTED" };

function makeStream() {
  const t = track();
  return { t, stream: { getTracks: () => [t], getAudioTracks: () => [t], getVideoTracks: () => [] } };
}

async function startAcceptedCall(result: { current: ReturnType<typeof useCall> }) {
  socket.emit.mockImplementation((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
    if (ev === "call:initiate") cb?.({ ok: true, call: { ...call, status: "RINGING" } });
  });
  await act(async () => {
    await result.current.startCall("conv", "peer", "Peer", "AUDIO");
  });
  await act(async () => {
    await handlers.get("call:accepted")!({ call });
  });
}

describe("CallContext (ciclo de vida WebRTC)", () => {
  let media: ReturnType<typeof makeStream>;
  const wrapper = ({ children }: { children: React.ReactNode }) => <CallProvider>{children}</CallProvider>;

  beforeEach(() => {
    handlers.clear();
    FakePC.instances = [];
    socket.emit.mockReset();
    media = makeStream();
    vi.stubGlobal("RTCPeerConnection", FakePC);
    vi.stubGlobal("RTCSessionDescription", class {});
    vi.stubGlobal("RTCIceCandidate", class {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => media.stream) },
    });
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("call:accepted deja la llamada en 'connecting', no en 'connected'", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);

    await waitFor(() => expect(result.current.callState).toBe("connecting"));
    expect(FakePC.instances).toHaveLength(1);
    expect(socket.emit).toHaveBeenCalledWith("call:signal", expect.objectContaining({ callId: "c1" }));
  });

  it("pasa a 'connected' solo cuando connectionState es 'connected'", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);

    act(() => FakePC.instances[0].setState("connecting"));
    expect(result.current.callState).toBe("connecting");
    act(() => FakePC.instances[0].setState("connected"));
    expect(result.current.callState).toBe("connected");
  });

  it("'disconnected' no termina la llamada (permite recuperación)", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    act(() => FakePC.instances[0].setState("connected"));
    act(() => FakePC.instances[0].setState("disconnected"));
    expect(result.current.callState).toBe("connected");
  });

  it("'failed' avisa al peer, limpia recursos y expone el error", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    const pc = FakePC.instances[0];

    act(() => pc.setState("failed"));

    expect(socket.emit).toHaveBeenCalledWith("call:end", { callId: "c1" });
    expect(pc.close).toHaveBeenCalled();
    expect(pc.onconnectionstatechange).toBeNull();
    expect(media.t.stop).toHaveBeenCalled();
    expect(result.current.callState).toBe("idle");
    expect(result.current.activeCall).toBeNull();
    expect(result.current.callError).toBe("connection");
  });

  it("una señal tardía tras terminar la llamada no crea un PeerConnection nuevo", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    await act(async () => {
      await result.current.endCall();
    });
    expect(result.current.callState).toBe("idle");

    await act(async () => {
      await handlers.get("call:signal")!({
        callId: "c1",
        senderUserId: "peer",
        signal: { candidate: "x" },
      });
    });
    expect(FakePC.instances).toHaveLength(1);
  });

  it("una llamada nueva crea un PC limpio tras terminar la anterior", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    await act(async () => {
      await result.current.endCall();
    });
    await startAcceptedCall(result);
    expect(FakePC.instances).toHaveLength(2);
    expect(FakePC.instances[1]).not.toBe(FakePC.instances[0]);
  });

  it("getUserMedia falla al llamar: vuelve a idle y expone error de medios", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useCall(), { wrapper });

    await act(async () => {
      await result.current.startCall("conv", "peer", "Peer", "AUDIO");
    });

    expect(result.current.callState).toBe("idle");
    expect(result.current.callError).toBe("media");
    expect(socket.emit).not.toHaveBeenCalledWith("call:initiate", expect.anything(), expect.anything());
  });

  it("peerName es el nombre de la otra persona, para el receptor y para el llamante", async () => {
    const named = { ...call, callerName: "Juan", receiverName: "María" };

    // Soy el receptor ("me"): la llamada entrante viene de Juan
    const receiver = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      handlers.get("call:incoming")!({ call: { ...named, callerId: "peer", receiverId: "me" } });
    });
    expect(receiver.result.current.peerName).toBe("Juan");
    receiver.unmount();

    // Soy el llamante ("me"): el otro es el receptor
    handlers.clear();
    const caller = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(caller.result);
    await act(async () => {
      await handlers.get("call:accepted")!({ call: named });
    });
    expect(caller.result.current.peerName).toBe("María");
  });

  it("sin micrófono ni cámara: la llamada sigue en modo solo-recepción (recvonly)", async () => {
    const notFound = Object.assign(new Error("x"), { name: "NotFoundError" });
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(notFound);
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);

    expect(result.current.callState).toBe("connecting");
    expect(result.current.callError).toBeNull();
    expect(result.current.mediaWarning).toBe("no-mic");
    expect(FakePC.instances[0].addTransceiver).toHaveBeenCalledWith("audio", { direction: "recvonly" });
  });

  it("permiso denegado: error 'denied' (no degrada)", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.startCall("conv", "peer", "Peer", "AUDIO");
    });
    expect(result.current.callError).toBe("denied");
    expect(result.current.callState).toBe("idle");
  });

  it("sin navigator.mediaDevices (contexto HTTP inseguro): expone error 'insecure'", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const { result } = renderHook(() => useCall(), { wrapper });

    await act(async () => {
      await result.current.startCall("conv", "peer", "Peer", "AUDIO");
    });

    expect(result.current.callState).toBe("idle");
    expect(result.current.callError).toBe("insecure");
  });

  it("getUserMedia falla al aceptar: rechaza la llamada para no dejar al llamante esperando", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      handlers.get("call:incoming")!({ call: { ...call, callerId: "peer", receiverId: "me", status: "RINGING" } });
    });
    expect(result.current.callState).toBe("incoming");

    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      await result.current.acceptCall();
    });

    expect(socket.emit).toHaveBeenCalledWith("call:reject", { callId: "c1", reason: "declined" });
    expect(result.current.callState).toBe("idle");
    expect(result.current.callError).toBe("media");
  });
});
