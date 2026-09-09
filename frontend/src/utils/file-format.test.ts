import { describe, expect, it } from "vitest";
import { formatFileSize, isAudioMimeType, isImageMimeType } from "./file-format";

describe("file-format", () => {
  describe("formatFileSize", () => {
    it("formats bytes under 1024 as B", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("formats kilobytes with one decimal if under 10 KB, or rounded if 10 KB or more", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(5120)).toBe("5.0 KB");
      expect(formatFileSize(15360)).toBe("15 KB");
      expect(formatFileSize(245678)).toBe("240 KB");
    });

    it("formats megabytes correctly", () => {
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(15728640)).toBe("15 MB");
    });

    it("formats gigabytes correctly", () => {
      expect(formatFileSize(1073741824)).toBe("1.0 GB");
      expect(formatFileSize(5368709120)).toBe("5.0 GB");
    });
  });

  describe("isImageMimeType", () => {
    it("returns true for image mime types and false for others", () => {
      expect(isImageMimeType("image/png")).toBe(true);
      expect(isImageMimeType("image/jpeg")).toBe(true);
      expect(isImageMimeType("image/webp")).toBe(true);
      expect(isImageMimeType("application/pdf")).toBe(false);
      expect(isImageMimeType("video/mp4")).toBe(false);
    });
  });

  describe("isAudioMimeType", () => {
    it("returns true for audio mime types and false for others", () => {
      expect(isAudioMimeType("audio/ogg")).toBe(true);
      expect(isAudioMimeType("audio/webm")).toBe(true);
      expect(isAudioMimeType("audio/mpeg")).toBe(true);
      expect(isAudioMimeType("image/png")).toBe(false);
      expect(isAudioMimeType("application/json")).toBe(false);
    });
  });
});
