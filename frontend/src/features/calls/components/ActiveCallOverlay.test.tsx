import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActiveCallOverlay } from "./ActiveCallOverlay";
import * as UseCallModule from "../hooks/use-call";

vi.mock("../hooks/use-call");

describe("ActiveCallOverlay", () => {
  it("no renderiza nada si callState es idle", () => {
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "idle",
      activeCall: null,
    } as any);

    const { container } = render(<ActiveCallOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza overlay saliente y muestra estado 'Llamando...'", () => {
    const endCallMock = vi.fn();
    const toggleMuteMock = vi.fn();

    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "outgoing",
      peerName: "Dra. Laura",
      activeCall: {
        id: "call-1",
        receiverName: "Dra. Laura",
        type: "AUDIO",
      },
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
      callDuration: 0,
      endCall: endCallMock,
      toggleMute: toggleMuteMock,
      toggleVideo: vi.fn(),
    } as any);

    render(<ActiveCallOverlay />);

    expect(screen.getByText("Dra. Laura")).toBeInTheDocument();
    expect(screen.getByText("Llamando...")).toBeInTheDocument();
    expect(screen.getByText("Llamada de voz")).toBeInTheDocument();

    const muteBtn = screen.getByLabelText("Silenciar micrófono");
    fireEvent.click(muteBtn);
    expect(toggleMuteMock).toHaveBeenCalled();

    const endBtn = screen.getByLabelText("Finalizar llamada");
    fireEvent.click(endBtn);
    expect(endCallMock).toHaveBeenCalled();
  });

  it("renderiza llamada conectada con duración y controles de video", () => {
    const toggleVideoMock = vi.fn();

    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "connected",
      peerName: "Dr. Carlos",
      activeCall: {
        id: "call-2",
        callerName: "Dr. Carlos",
        type: "VIDEO",
      },
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
      callDuration: 85, // 01:25
      endCall: vi.fn(),
      toggleMute: vi.fn(),
      toggleVideo: toggleVideoMock,
    } as any);

    render(<ActiveCallOverlay />);

    expect(screen.getByText("Dr. Carlos")).toBeInTheDocument();
    expect(screen.getByText("01:25")).toBeInTheDocument();
    expect(screen.getByText("Videollamada")).toBeInTheDocument();

    const videoBtn = screen.getByLabelText("Apagar cámara");
    fireEvent.click(videoBtn);
    expect(toggleVideoMock).toHaveBeenCalled();
  });

  const baseCall = {
    localStream: null,
    remoteStream: null,
    callDuration: 0,
    endCall: vi.fn(),
    toggleMute: vi.fn(),
    toggleVideo: vi.fn(),
  };

  it("llamada de voz: reproduce el stream remoto solo en <audio>", () => {
    const remoteStream = {} as MediaStream;
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      ...baseCall,
      callState: "connected",
      activeCall: { id: "c", receiverName: "X", type: "AUDIO" },
      remoteStream,
    } as any);

    const { container } = render(<ActiveCallOverlay />);
    expect(container.querySelectorAll("video")).toHaveLength(0);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio.srcObject).toBe(remoteStream);
  });

  it("videollamada: stream remoto solo en <video> (sin <audio>) y el local va muted", () => {
    const remoteStream = {} as MediaStream;
    const localStream = {} as MediaStream;
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      ...baseCall,
      callState: "connected",
      activeCall: { id: "c", receiverName: "X", type: "VIDEO" },
      localStream,
      remoteStream,
    } as any);

    const { container } = render(<ActiveCallOverlay />);
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    const videos = Array.from(container.querySelectorAll("video"));
    expect(videos).toHaveLength(2);
    const remote = videos.find((v) => v.srcObject === remoteStream)!;
    const local = videos.find((v) => v.srcObject === localStream)!;
    expect(remote.muted).toBe(false);
    expect(local.muted).toBe(true);
  });

  it("muestra 'Conectando...' mientras WebRTC negocia (callState connecting)", () => {
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      ...baseCall,
      callState: "connecting",
      activeCall: { id: "c", receiverName: "X", type: "AUDIO" },
    } as any);

    render(<ActiveCallOverlay />);
    expect(screen.getAllByText("Conectando...").length).toBeGreaterThan(0);
  });

  it("muestra el error de la llamada aunque ya no haya llamada activa", () => {
    const clearCallError = vi.fn();
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "idle",
      activeCall: null,
      callError: "media",
      clearCallError,
    } as any);

    render(<ActiveCallOverlay />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo acceder al micrófono");
    fireEvent.click(screen.getByText("OK"));
    expect(clearCallError).toHaveBeenCalled();
  });
});
