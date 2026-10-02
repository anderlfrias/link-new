import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireLocalMedia, classifyMediaError, MediaAccessError } from "./call-media";

const named = (name: string) => Object.assign(new Error(name), { name });
const stream = (tag: string) => ({ tag }) as unknown as MediaStream;

function setGetUserMedia(fn: ((c: MediaStreamConstraints) => Promise<MediaStream>) | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: fn ? { getUserMedia: fn } : undefined,
  });
}

describe("classifyMediaError", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotReadableError", "in-use"],
    ["AbortError", "in-use"],
    ["TypeError", "media"],
  ])("%s → %s", (name, expected) => {
    expect(classifyMediaError(named(name))).toBe(expected);
  });

  it("respeta un MediaAccessError ya clasificado", () => {
    expect(classifyMediaError(new MediaAccessError("insecure"))).toBe("insecure");
  });
});

describe("acquireLocalMedia", () => {
  afterEach(() => setGetUserMedia(undefined));

  it("sin navigator.mediaDevices lanza 'insecure'", async () => {
    setGetUserMedia(undefined);
    await expect(acquireLocalMedia("AUDIO")).rejects.toMatchObject({ kind: "insecure" });
  });

  it("devuelve el stream completo sin warning", async () => {
    const s = stream("full");
    setGetUserMedia(vi.fn(async () => s));
    await expect(acquireLocalMedia("VIDEO")).resolves.toEqual({ stream: s, warning: null });
  });

  it("llamada de voz sin micrófono: sigue sin stream (solo escuchar)", async () => {
    setGetUserMedia(vi.fn(async () => Promise.reject(named("NotFoundError"))));
    await expect(acquireLocalMedia("AUDIO")).resolves.toEqual({ stream: null, warning: "no-mic" });
  });

  it("videollamada sin cámara: degrada a solo audio", async () => {
    const audio = stream("audio");
    const gum = vi.fn(async (c: MediaStreamConstraints) => {
      if (c.video) throw named("NotFoundError");
      return audio;
    });
    setGetUserMedia(gum);
    await expect(acquireLocalMedia("VIDEO")).resolves.toEqual({ stream: audio, warning: "no-camera" });
  });

  it("videollamada sin micrófono pero con cámara: degrada a solo video", async () => {
    const video = stream("video");
    const gum = vi.fn(async (c: MediaStreamConstraints) => {
      if (c.audio) throw named("NotFoundError");
      return video;
    });
    setGetUserMedia(gum);
    await expect(acquireLocalMedia("VIDEO")).resolves.toEqual({ stream: video, warning: "no-mic" });
  });

  it("videollamada sin ningún dispositivo: sigue en modo solo-recepción", async () => {
    setGetUserMedia(vi.fn(async () => Promise.reject(named("NotFoundError"))));
    await expect(acquireLocalMedia("VIDEO")).resolves.toEqual({ stream: null, warning: "no-devices" });
  });

  it("permiso denegado NO degrada: se propaga clasificado", async () => {
    setGetUserMedia(vi.fn(async () => Promise.reject(named("NotAllowedError"))));
    await expect(acquireLocalMedia("VIDEO")).rejects.toMatchObject({ kind: "denied" });
  });

  it("dispositivo ocupado se propaga como 'in-use'", async () => {
    setGetUserMedia(vi.fn(async () => Promise.reject(named("NotReadableError"))));
    await expect(acquireLocalMedia("AUDIO")).rejects.toMatchObject({ kind: "in-use" });
  });
});
