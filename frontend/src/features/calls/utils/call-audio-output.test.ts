import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAudioOutput,
  classifyOutput,
  defaultOutputFor,
  isMobileDevice,
  listOutputDevices,
  supportsOutputSelection,
  type OutputDevice,
} from "./call-audio-output";

function setUA(ua: string, touch = 0) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: touch });
}

function setDevices(list: unknown[] | Error) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: async () => (list instanceof Error ? Promise.reject(list) : list),
    },
  });
}

const out = (deviceId: string, label: string) => ({ kind: "audiooutput", deviceId, label });

describe("call-audio-output", () => {
  const originalUA = navigator.userAgent;
  afterEach(() => setUA(originalUA, 0));

  it("detecta celulares y iPadOS, no escritorio", () => {
    setUA("Mozilla/5.0 (Linux; Android 14)");
    expect(isMobileDevice()).toBe(true);
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5);
    expect(isMobileDevice()).toBe(true);
    setUA("Mozilla/5.0 (Windows NT 10.0; Win64)");
    expect(isMobileDevice()).toBe(false);
  });

  it("clasifica por etiqueta", () => {
    expect(classifyOutput("Earpiece")).toBe("earpiece");
    expect(classifyOutput("Speakerphone")).toBe("speaker");
    expect(classifyOutput("Galaxy Buds")).toBe("other");
  });

  it("lista salidas ignorando alias 'default'/'communications' y entradas", async () => {
    setDevices([
      { kind: "audioinput", deviceId: "m", label: "Mic" },
      out("default", "Default"),
      out("communications", "Communications"),
      out("spk", "Speakerphone"),
      out("bt", "Galaxy Buds"),
    ]);
    const list = await listOutputDevices();
    expect(list.map((d) => d.id)).toEqual(["spk", "bt"]);
    expect(list.map((d) => d.kind)).toEqual(["speaker", "other"]);
  });

  it("conserva 'default' si es la única salida", async () => {
    setDevices([out("default", "Default")]);
    expect((await listOutputDevices()).map((d) => d.id)).toEqual(["default"]);
  });

  it("si enumerateDevices falla devuelve vacío (sin romper la llamada)", async () => {
    setDevices(new Error("x"));
    await expect(listOutputDevices()).resolves.toEqual([]);
  });

  it("voz → auricular, video → altavoz; null si no existe esa salida", () => {
    const devices: OutputDevice[] = [
      { id: "ear", label: "Earpiece", kind: "earpiece" },
      { id: "spk", label: "Speaker", kind: "speaker" },
    ];
    expect(defaultOutputFor(false, devices)).toBe("ear");
    expect(defaultOutputFor(true, devices)).toBe("spk");
    expect(defaultOutputFor(false, [devices[1]])).toBeNull();
  });

  it("applyAudioOutput usa setSinkId", async () => {
    const el = { setSinkId: vi.fn(async () => {}) } as unknown as HTMLMediaElement;
    expect(supportsOutputSelection(el)).toBe(true);
    await expect(applyAudioOutput(el, "ear")).resolves.toBe(true);
    expect((el as any).setSinkId).toHaveBeenCalledWith("ear");
  });

  it("applyAudioOutput devuelve false sin soporte o si setSinkId falla", async () => {
    const noSink = {} as HTMLMediaElement;
    expect(supportsOutputSelection(noSink)).toBe(false);
    await expect(applyAudioOutput(noSink, "x")).resolves.toBe(false);
    const failing = { setSinkId: vi.fn(async () => Promise.reject(new Error("no"))) } as unknown as HTMLMediaElement;
    await expect(applyAudioOutput(failing, "x")).resolves.toBe(false);
  });
});
