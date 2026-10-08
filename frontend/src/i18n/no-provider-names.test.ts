import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { es } from "./locales/es";

/// Nombres de proveedores de identidad concretos que los textos de la interfaz no pueden contener: el
/// nombre llega de `GET /auth/config` (`provider.displayName`) y se interpola con `{provider}`. Se arman
/// por partes para que este archivo tampoco los contenga (el repositorio público no nombra ningún
/// proveedor privado).
const PROVIDER_NAMES = [["x", "user"].join("")];

describe("textos de la interfaz", () => {
  it.each(["en", "es"] as const)("%s no nombra a ningún proveedor de identidad concreto", (locale) => {
    const source = readFileSync(join(__dirname, "locales", `${locale}.ts`), "utf8");

    for (const name of PROVIDER_NAMES) {
      expect(source).not.toMatch(new RegExp(name, "i"));
    }
  });

  it("los textos que dependen del proveedor lo reciben como parámetro, en los dos idiomas", () => {
    for (const messages of [en, es]) {
      expect(messages.admin.users.externalNotice).toContain("{provider}");
      expect(messages.admin.users.syncedWithProvider).toContain("{provider}");
    }
  });
});
