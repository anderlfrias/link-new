import { afterEach, describe, expect, it, vi } from "vitest";

// `corsOrigin` se calcula una sola vez al importar el módulo (no es una
// función), así que para probar los dos casos hace falta resetear el
// registro de módulos de vitest y reimportar dinámicamente con
// `process.env.CORS_ORIGIN` distinto cada vez.
const ORIGINAL_CORS_ORIGIN = process.env.CORS_ORIGIN;

afterEach(() => {
  if (ORIGINAL_CORS_ORIGIN === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = ORIGINAL_CORS_ORIGIN;
  }
  vi.resetModules();
});

describe("parseCorsOrigin", () => {
  it("\"*\" -> true (cualquier origen, a propósito)", async () => {
    const { parseCorsOrigin } = await import("./cors-origins");

    expect(parseCorsOrigin("*")).toBe(true);
    expect(parseCorsOrigin(" * ")).toBe(true);
  });

  it("descarta entradas vacías de la lista", async () => {
    const { parseCorsOrigin } = await import("./cors-origins");

    expect(parseCorsOrigin("https://a.example.com,,")).toEqual(["https://a.example.com"]);
  });

  it("una lista sin ningún origen válido no abre nada (falla cerrado)", async () => {
    const { parseCorsOrigin } = await import("./cors-origins");

    expect(parseCorsOrigin(" , ")).toEqual([]);
  });
});

describe("corsOrigin", () => {
  it("CORS_ORIGIN sin definir -> true (abierto a cualquier origen, ver config/env.ts)", async () => {
    delete process.env.CORS_ORIGIN;
    vi.resetModules();

    const { corsOrigin } = await import("./cors-origins");

    expect(corsOrigin).toBe(true);
  });

  it("CORS_ORIGIN con varios orígenes separados por coma -> array, con espacios recortados", async () => {
    process.env.CORS_ORIGIN = "https://a.example.com, https://b.example.com";
    vi.resetModules();

    const { corsOrigin } = await import("./cors-origins");

    expect(corsOrigin).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("CORS_ORIGIN con un solo origen -> array de un elemento", async () => {
    process.env.CORS_ORIGIN = "https://solo-uno.example.com";
    vi.resetModules();

    const { corsOrigin } = await import("./cors-origins");

    expect(corsOrigin).toEqual(["https://solo-uno.example.com"]);
  });
});
