import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("format-duration", () => {
  it("returns '0:00' for negative, non-finite, or zero values", () => {
    expect(formatDuration(-100)).toBe("0:00");
    expect(formatDuration(NaN)).toBe("0:00");
    expect(formatDuration(Infinity)).toBe("0:00");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats seconds with zero padding", () => {
    expect(formatDuration(5000)).toBe("0:05");
    expect(formatDuration(9999)).toBe("0:09");
    expect(formatDuration(10000)).toBe("0:10");
  });

  it("formats minutes and seconds correctly", () => {
    expect(formatDuration(65000)).toBe("1:05");
    expect(formatDuration(125000)).toBe("2:05");
    expect(formatDuration(599000)).toBe("9:59");
    expect(formatDuration(3600000)).toBe("60:00");
  });
});
