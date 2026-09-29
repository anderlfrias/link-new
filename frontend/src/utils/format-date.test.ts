import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatConversationTimestamp, formatDateSeparator } from "./format-date";

describe("format-date", () => {
  const fixedNow = new Date("2026-09-09T15:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatConversationTimestamp", () => {
    it("returns time formatted when date is today", () => {
      const result = formatConversationTimestamp("2026-09-09T14:30:00.000Z");
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it("returns 'Ayer' when date is yesterday", () => {
      const yesterday = new Date(fixedNow);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = formatConversationTimestamp(yesterday.toISOString());
      expect(result).toBe("Ayer");
    });

    it("returns capitalized weekday name when date is within the last 7 days", () => {
      const threeDaysAgo = new Date(fixedNow);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const result = formatConversationTimestamp(threeDaysAgo.toISOString());
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(2);
      expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
    });

    it("returns date formatted as DD/MM/YY when older than 7 days", () => {
      const tenDaysAgo = new Date(fixedNow);
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const result = formatConversationTimestamp(tenDaysAgo.toISOString());
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{2}/);
    });
  });

  describe("formatDateSeparator", () => {
    it("returns 'Hoy' when date is today", () => {
      expect(formatDateSeparator("2026-09-09T12:00:00.000Z")).toBe("Hoy");
    });

    it("returns 'Ayer' when date is yesterday", () => {
      const yesterday = new Date(fixedNow);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDateSeparator(yesterday.toISOString())).toBe("Ayer");
    });

    it("returns full localized date when older than yesterday", () => {
      const older = new Date("2026-01-15T12:00:00.000Z");
      const result = formatDateSeparator(older.toISOString());
      expect(result).toMatch(/15 de enero de 2026/);
    });

    it("supports English locale for 'Today', 'Yesterday', and full date", () => {
      expect(formatDateSeparator("2026-09-09T12:00:00.000Z", "en")).toBe("Today");

      const yesterday = new Date(fixedNow);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDateSeparator(yesterday.toISOString(), "en")).toBe("Yesterday");

      const older = new Date("2026-01-15T12:00:00.000Z");
      expect(formatDateSeparator(older.toISOString(), "en")).toMatch(/January 15, 2026/);
    });

    it("supports English locale in formatConversationTimestamp", () => {
      const yesterday = new Date(fixedNow);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatConversationTimestamp(yesterday.toISOString(), "en")).toBe("Yesterday");
    });
  });
});
