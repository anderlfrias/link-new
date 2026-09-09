import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceRecorder } from "./use-voice-recorder";

class MockMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = "audio/webm";

  constructor(public stream: any) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(["audio-bytes"], { type: "audio/webm" }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

describe("useVoiceRecorder", () => {
  let mockTrack: { stop: any };
  let mockStream: { getTracks: any };

  beforeEach(() => {
    vi.useFakeTimers();
    mockTrack = { stop: vi.fn() };
    mockStream = { getTracks: vi.fn(() => [mockTrack]) };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    (globalThis as any).MediaRecorder = MockMediaRecorder;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts recording on start() and tracks elapsed time", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    expect(result.current.status).toBe("idle");
    expect(result.current.elapsedMs).toBe(0);

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("recording");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1000);
  });

  it("handles microphone permission rejection and sets error status", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error("Permission denied"),
    );

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
  });

  it("stops recording and returns audio File", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    let file: File | null = null;
    await act(async () => {
      file = await result.current.stop();
    });

    expect(result.current.status).toBe("idle");
    expect(file).toBeInstanceOf(File);
    expect((file as any)?.name).toBe("nota-de-voz.webm");
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("cancels recording and discards audio without returning file", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.status).toBe("idle");
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("stops tracks if unmounted during active recording", async () => {
    const { result, unmount } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    unmount();

    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
