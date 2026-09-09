import { describe, expect, it } from "vitest";
import { isValidMimeTypePattern, MIME_TYPE_PATTERN } from "./mime-type-pattern";

describe("mime-type-pattern", () => {
  it("validates exact mime types and wildcards", () => {
    expect(isValidMimeTypePattern("application/pdf")).toBe(true);
    expect(isValidMimeTypePattern("image/png")).toBe(true);
    expect(isValidMimeTypePattern("image/*")).toBe(true);
    expect(isValidMimeTypePattern("audio/webm")).toBe(true);
    expect(isValidMimeTypePattern("video/*")).toBe(true);
    expect(isValidMimeTypePattern("application/vnd.ms-excel")).toBe(true);
  });

  it("rejects file extensions, malformed types, or invalid wildcards", () => {
    expect(isValidMimeTypePattern(".pdf")).toBe(false);
    expect(isValidMimeTypePattern("png")).toBe(false);
    expect(isValidMimeTypePattern("image/")).toBe(false);
    expect(isValidMimeTypePattern("*/*")).toBe(false);
    expect(isValidMimeTypePattern("image/*something")).toBe(false);
    expect(isValidMimeTypePattern("text/plain/extra")).toBe(false);
    expect(isValidMimeTypePattern("")).toBe(false);
  });

  it("matches regex pattern mirror from backend settings.validator.ts", () => {
    expect(MIME_TYPE_PATTERN.test("image/*")).toBe(true);
    expect(MIME_TYPE_PATTERN.test(".pdf")).toBe(false);
  });
});
