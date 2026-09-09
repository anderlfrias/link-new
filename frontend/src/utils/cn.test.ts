import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("combina varias clases en un solo string", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignora valores condicionales falsy", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("resuelve conflictos de Tailwind quedándose con la última clase", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("soporta objetos de clases condicionales", () => {
    expect(cn({ a: true, b: false, c: true })).toBe("a c");
  });
});
