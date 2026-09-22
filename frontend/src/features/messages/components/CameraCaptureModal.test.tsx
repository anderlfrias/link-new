import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CameraCaptureModal } from "./CameraCaptureModal";

describe("CameraCaptureModal", () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: () => any[] };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTrack = { stop: vi.fn() };
    mockStream = {
      getTracks: () => [mockTrack],
    };

    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-camera-capture");
    global.URL.revokeObjectURL = vi.fn();

    // Mock HTMLMediaElement play
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    // Mock canvas context and toBlob
    const mockContext = {
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((cb) => {
      cb(new Blob(["photo-content"], { type: "image/jpeg" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when open is false", () => {
    render(<CameraCaptureModal open={false} onClose={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders camera dialog, starts camera stream and displays shutter button", async () => {
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Cámara" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Visor de cámara")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });
  });

  it("allows taking photo, switching to review mode, and confirming photo", async () => {
    const onCapture = vi.fn();
    const onClose = vi.fn();

    render(<CameraCaptureModal open={true} onClose={onClose} onCapture={onCapture} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });

    // Mock video dimensions on video element
    const video = screen.getByLabelText("Visor de cámara") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 1280 });
    Object.defineProperty(video, "videoHeight", { value: 720 });

    // Click shutter
    fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));

    await waitFor(() => {
      expect(screen.getByAltText("Foto capturada")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Repetir foto" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Usar foto" })).toBeInTheDocument();
    });

    // Confirm photo
    fireEvent.click(screen.getByRole("button", { name: "Usar foto" }));

    expect(onCapture).toHaveBeenCalledTimes(1);
    const capturedFile = onCapture.mock.calls[0][0];
    expect(capturedFile).toBeInstanceOf(File);
    expect(capturedFile.type).toBe("image/jpeg");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows retaking photo after capture", async () => {
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });

    const video = screen.getByLabelText("Visor de cámara") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 1280 });
    Object.defineProperty(video, "videoHeight", { value: 720 });

    fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Repetir foto" })).toBeInTheDocument();
    });

    // Click retake
    fireEvent.click(screen.getByRole("button", { name: "Repetir foto" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Visor de cámara")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });
  });

  it("closes modal on close button click and on Escape key", async () => {
    const onClose = vi.fn();
    render(<CameraCaptureModal open={true} onClose={onClose} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole("button", { name: "Cerrar cámara" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("switches camera between user and environment modes", async () => {
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cambiar cámara" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cambiar cámara" }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: "environment" }),
        }),
      );
    });
  });
});
