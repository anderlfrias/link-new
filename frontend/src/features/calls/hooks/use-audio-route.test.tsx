import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioRoute } from "./use-audio-route";

const out = (deviceId: string, label: string) => ({ kind: "audiooutput", deviceId, label });

describe("useAudioRoute", () => {
  const originalUA = navigator.userAgent;
  let el: { setSinkId: ReturnType<typeof vi.fn> };
  const stream = {};

  function setMobile(devices: unknown[]) {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Linux; Android 14)" });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices: async () => devices, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
  }

  beforeEach(() => {
    el = { setSinkId: vi.fn(async () => {}) };
  });
  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUA });
  });

  const render = (isVideoCall: boolean) =>
    renderHook(() =>
      useAudioRoute({
        active: true,
        isVideoCall,
        getElement: () => el as unknown as HTMLMediaElement,
        streamKey: stream,
      }),
    );

  it("llamada de voz en celular: arranca en auricular", async () => {
    setMobile([out("ear", "Earpiece"), out("spk", "Speakerphone")]);
    const { result } = render(false);
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.selectedId).toBe("ear");
    await waitFor(() => expect(el.setSinkId).toHaveBeenCalledWith("ear"));
  });

  it("videollamada: arranca en altavoz, y el usuario puede elegir Bluetooth", async () => {
    setMobile([out("ear", "Earpiece"), out("spk", "Speakerphone"), out("bt", "Galaxy Buds")]);
    const { result } = render(true);
    await waitFor(() => expect(result.current.selectedId).toBe("spk"));

    act(() => result.current.select("bt"));
    expect(result.current.selectedId).toBe("bt");
    await waitFor(() => expect(el.setSinkId).toHaveBeenLastCalledWith("bt"));
  });

  it("con una sola salida no se ofrece el selector", async () => {
    setMobile([out("spk", "Speakerphone")]);
    const { result } = render(false);
    await waitFor(() => expect(result.current.devices).toHaveLength(1));
    expect(result.current.available).toBe(false);
  });

  it("en escritorio no se ofrece", async () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Windows NT 10.0)" });
    const { result } = render(false);
    expect(result.current.available).toBe(false);
  });
});
