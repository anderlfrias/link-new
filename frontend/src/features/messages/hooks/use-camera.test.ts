import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCamera } from "./use-camera";

describe("useCamera", () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: () => any[] };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTrack = { stop: vi.fn() };
    mockStream = {
      getTracks: () => [mockTrack],
    };

    // Mock navigator.mediaDevices
    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    // Mock URL.createObjectURL / revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-camera-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes in idle state", () => {
    const { result } = renderHook(() => useCamera());

    expect(result.current.status).toBe("idle");
    expect(result.current.stream).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.capturedBlob).toBeNull();
    expect(result.current.capturedUrl).toBeNull();
  });

  it("starts camera successfully and assigns stream", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("user");
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: "user" }),
      }),
    );
    expect(result.current.status).toBe("ready");
    expect(result.current.stream).toBe(mockStream);
    expect(result.current.facingMode).toBe("user");
  });

  it("switches camera between user and environment", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("user");
    });

    expect(result.current.facingMode).toBe("user");

    await act(async () => {
      await result.current.switchCamera();
    });

    expect(result.current.facingMode).toBe("environment");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: "environment" }),
      }),
    );
  });

  it("handles permission denied error", async () => {
    const permError = new Error("Permission denied");
    permError.name = "NotAllowedError";
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(permError);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("Permiso denegado");
    expect(result.current.stream).toBeNull();
  });

  it("handles camera not found error", async () => {
    const notFoundError = new Error("Not found");
    notFoundError.name = "NotFoundError";
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(notFoundError);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("No se encontró ninguna cámara");
  });

  it("stops camera and terminates tracks", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.stream).toBe(mockStream);

    act(() => {
      result.current.stopCamera();
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });

  it("captures photo, stops live stream, and creates file upon confirmation", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("user");
    });

    // Mock video element
    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    // Mock canvas 2D context
    const mockContext = {
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);

    const mockBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback) => {
      callback(mockBlob);
    });

    let capturedResult: Blob | null = null;
    await act(async () => {
      capturedResult = await result.current.capture(mockVideo);
    });

    expect(capturedResult).toBe(mockBlob);
    expect(result.current.status).toBe("captured");
    expect(result.current.capturedBlob).toBe(mockBlob);
    expect(result.current.capturedUrl).toBe("blob:mock-camera-url");
    // Camera stream stopped after capture
    expect(result.current.stream).toBeNull();
    expect(mockTrack.stop).toHaveBeenCalled();

    // Confirm photo to File
    const file = result.current.confirmPhoto("mi_foto.jpg");
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("mi_foto.jpg");
    expect(file?.type).toBe("image/jpeg");

    // Retake restarts camera
    await act(async () => {
      await result.current.retake();
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.capturedBlob).toBeNull();
    expect(result.current.capturedUrl).toBeNull();
  });
});
