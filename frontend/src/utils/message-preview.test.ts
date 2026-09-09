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

  it("returns '📎 Archivo adjunto' when content is empty but files are attached", () => {
    expect(
      buildMessagePreview({
        deletedAt: null,
        content: "   ",
        files: [{ id: "f-1" } as any],
      }),
    ).toBe("📎 Archivo adjunto");
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
});
