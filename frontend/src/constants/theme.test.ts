import { beforeEach, describe, expect, it } from "vitest";
import { LEGACY_THEME_STORAGE_KEY, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

/// El script corre como string inline antes de hidratar: se prueba evaluándolo, igual que el navegador.
function runInitScript() {
  new Function(THEME_INIT_SCRIPT)();
}

describe("THEME_INIT_SCRIPT", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("aplica el tema oscuro guardado bajo la clave nueva", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("aplica el tema oscuro guardado bajo la clave vieja, para no perderlo al actualizar", () => {
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("la clave nueva manda sobre la vieja", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("sin nada guardado deja el tema claro", () => {
    runInitScript();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("no lanza si localStorage no está disponible", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });

    try {
      expect(() => runInitScript()).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
