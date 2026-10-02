import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./app-version.constant";
import pkg from "../../package.json";

describe("APP_VERSION", () => {
  it("debe tener formato semver válido (MAJOR.MINOR.PATCH)", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("debe estar sincronizada con la versión del paquete", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});

