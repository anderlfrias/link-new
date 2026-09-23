import { describe, expect, it } from "vitest";
import { buildMessagePreview } from "./message-preview";

describe("message-preview", () => {
  it("returns 'Mensaje eliminado' if deletedAt is present, regardless of content or files (mandatory invariant)", () => {
    expect(
      buildMessagePreview({
        deletedAt: "2026-09-09T12:00:00.000Z",
        content: "Mensaje original secreto",
        files: [{ id: "f-1" } as any],
      }),
    ).toBe("Mensaje eliminado");
  });

  it("returns trimmed text when content is not empty and message is not deleted", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "   Hola mundo   ",
        files: [],
      }),
    ).toBe("Hola mundo");
  });

  it("returns 'Archivo adjunto' when content is empty but files are attached", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "   ",
        files: [{ id: "f-1" } as any],
      }),
    ).toBe("Archivo adjunto");
  });

  it("returns empty string when content is empty and no files are attached", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [],
      }),
    ).toBe("");
  });

  it("returns 'Contacto: [Nombre]' or 'Contacto' for CONTACT messages", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: JSON.stringify({ name: "Carlos Perez" }),
        files: [],
        type: "CONTACT",
      }),
    ).toBe("Contacto: Carlos Perez");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "invalid",
        files: [],
        type: "CONTACT",
      }),
    ).toBe("Contacto");
  });

  it("returns 'Sticker' for STICKER messages", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "s-1", file: { mimeType: "image/webp", originalName: "sticker.webp" } } as any],
        type: "STICKER",
      }),
    ).toBe("Sticker");
  });

  it("returns 'Encuesta: [pregunta]' or 'Encuesta' for POLL messages", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "¿A qué hora nos juntamos?",
        files: [],
        type: "POLL",
      }),
    ).toBe("Encuesta: ¿A qué hora nos juntamos?");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "   ",
        files: [],
        type: "POLL",
      }),
    ).toBe("Encuesta");
  });

  it("segments voice notes (audio/*)", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "a-1", file: { mimeType: "audio/ogg", originalName: "voice.ogg" } } as any],
      }),
    ).toBe("Nota de voz");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "Mensaje de voz explicativo",
        files: [{ id: "a-1", file: { mimeType: "audio/mp3", originalName: "audio.mp3" } } as any],
      }),
    ).toBe("Nota de voz: Mensaje de voz explicativo");
  });

  it("segments gifs (image/gif)", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "g-1", file: { mimeType: "image/gif", originalName: "dance.gif" } } as any],
      }),
    ).toBe("GIF");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "Mira esto",
        files: [{ id: "g-1", file: { mimeType: "image/gif", originalName: "dance.gif" } } as any],
      }),
    ).toBe("GIF: Mira esto");
  });

  it("segments photos/images (image/* non-gif)", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "i-1", file: { mimeType: "image/png", originalName: "photo.png" } } as any],
      }),
    ).toBe("Imagen");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [
          { id: "i-1", file: { mimeType: "image/png", originalName: "1.png" } } as any,
          { id: "i-2", file: { mimeType: "image/jpeg", originalName: "2.jpg" } } as any,
        ],
      }),
    ).toBe("2 imágenes");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "Foto del evento",
        files: [{ id: "i-1", file: { mimeType: "image/jpeg", originalName: "evento.jpg" } } as any],
      }),
    ).toBe("Foto del evento");
  });

  it("segments videos (video/*)", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "v-1", file: { mimeType: "video/mp4", originalName: "clip.mp4" } } as any],
      }),
    ).toBe("Video");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [
          { id: "v-1", file: { mimeType: "video/mp4", originalName: "1.mp4" } } as any,
          { id: "v-2", file: { mimeType: "video/mp4", originalName: "2.mp4" } } as any,
          { id: "v-3", file: { mimeType: "video/mp4", originalName: "3.mp4" } } as any,
        ],
      }),
    ).toBe("3 videos");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "Grabación reunión",
        files: [{ id: "v-1", file: { mimeType: "video/webm", originalName: "meet.webm" } } as any],
      }),
    ).toBe("Grabación reunión");
  });

  it("segments other files as 'Archivo adjunto'", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "d-1", file: { mimeType: "application/pdf", originalName: "contrato.pdf" } } as any],
      }),
    ).toBe("Archivo adjunto");

    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "Favor revisar",
        files: [{ id: "d-1", file: { mimeType: "application/pdf", originalName: "resumen.pdf" } } as any],
      }),
    ).toBe("Favor revisar");
  });

  it("supports flat mimeType/originalName on file objects", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "",
        files: [{ id: "f-flat", mimeType: "audio/webm", originalName: "audio.webm" }],
      }),
    ).toBe("Nota de voz");
  });
});

