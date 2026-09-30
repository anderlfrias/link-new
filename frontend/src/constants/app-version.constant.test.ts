import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./app-version.constant";

describe("APP_VERSION", () => {
  it("debe tener formato semver válido (MAJOR.MINOR.PATCH)", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("debe estar sincronizada con la versión 1.0.0", () => {
    expect(APP_VERSION).toBe("1.0.0");
  });
});
