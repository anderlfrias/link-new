import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IncomingCallModal } from "./IncomingCallModal";
import * as UseCallModule from "../hooks/use-call";

vi.mock("../hooks/use-call");

describe("IncomingCallModal", () => {
  it("no renderiza nada si callState es idle", () => {
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "idle",
      activeCall: null,
      acceptCall: vi.fn(),
      rejectCall: vi.fn(),
    } as any);

    const { container } = render(<IncomingCallModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza modal cuando hay llamada entrante y permite aceptar", () => {
    const acceptCallMock = vi.fn();
    const rejectCallMock = vi.fn();

    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "incoming",
      activeCall: {
        id: "call-1",
        callerName: "Dr. Roberto",
        type: "AUDIO",
      },
      acceptCall: acceptCallMock,
      rejectCall: rejectCallMock,
    } as any);

    render(<IncomingCallModal />);

    expect(screen.getByRole("dialog", { name: "Llamada entrante" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Roberto")).toBeInTheDocument();
    expect(screen.getByText("Llamada de voz entrante...")).toBeInTheDocument();

    const acceptBtn = screen.getByLabelText("Aceptar llamada");
    fireEvent.click(acceptBtn);
    expect(acceptCallMock).toHaveBeenCalled();
  });

  it("permite rechazar la llamada entrante", () => {
    const rejectCallMock = vi.fn();

    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "incoming",
      activeCall: {
        id: "call-2",
        callerName: "Dra. Ana",
        type: "VIDEO",
      },
      acceptCall: vi.fn(),
      rejectCall: rejectCallMock,
    } as any);

    render(<IncomingCallModal />);

    expect(screen.getByText("Videollamada entrante...")).toBeInTheDocument();

    const rejectBtn = screen.getByLabelText("Rechazar llamada");
    fireEvent.click(rejectBtn);
    expect(rejectCallMock).toHaveBeenCalledWith("declined");
  });
});
