import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWithinMessageTimeLimit } from "./message-edit-window";

describe("message-edit-window", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when limitMinutes is null (unlimited)", () => {
    const veryOldMessage = new Date("2020-01-01T00:00:00.000Z").toISOString();
    expect(isWithinMessageTimeLimit(veryOldMessage, null)).toBe(true);
  });

  it("returns true when elapsed time is less than or equal to limitMinutes", () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(isWithinMessageTimeLimit(fiveMinutesAgo, 15)).toBe(true);

    const exactLimitAgo = new Date(now.getTime() - 15 * 60_000).toISOString();
    expect(isWithinMessageTimeLimit(exactLimitAgo, 15)).toBe(true);
  });

  it("returns false when elapsed time exceeds limitMinutes", () => {
    const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60_000).toISOString();
    expect(isWithinMessageTimeLimit(sixteenMinutesAgo, 15)).toBe(false);
  });
});
