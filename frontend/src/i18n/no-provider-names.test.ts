import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { es } from "./locales/es";

/// Los textos de la interfaz no nombran ningún proveedor de identidad: el nombre llega de
/// `GET /auth/config` (`provider.displayName`) y se interpola con `{provider}`.
describe("textos de la interfaz", () => {
  it.each(["en", "es"] as const)("%s no nombra a EXTERNAL_AUTH ni a ningún otro proveedor concreto", (locale) => {
    const source = readFileSync(join(__dirname, "locales", `${locale}.ts`), "utf8");

    expect(source).not.toMatch(/external-auth/i);
  });

  it("los textos que dependen del proveedor lo reciben como parámetro, en los dos idiomas", () => {
    for (const messages of [en, es]) {
      expect(messages.admin.users.externalNotice).toContain("{provider}");
      expect(messages.admin.users.syncedWithProvider).toContain("{provider}");
    }
  });
});
