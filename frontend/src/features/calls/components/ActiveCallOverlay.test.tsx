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
});
