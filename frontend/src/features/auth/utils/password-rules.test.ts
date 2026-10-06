import { describe, expect, it } from "vitest";
import type { PasswordPolicy } from "@/features/auth/types/auth.types";
import { activePasswordRules, effectiveMinLength, failedPasswordRules } from "./password-rules";

const LAX: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
  historyCount: 0,
};

const STRICT: PasswordPolicy = { ...LAX, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSymbol: true };

describe("password-rules (mismas reglas que el backend)", () => {
  it("con la política por defecto solo aplica el largo mínimo", () => {
    expect(activePasswordRules(LAX)).toEqual(["min_length"]);
    expect(failedPasswordRules("corta", LAX)).toEqual(["min_length"]);
    expect(failedPasswordRules("una frase bastante larga", LAX)).toEqual([]);
  });

  it("muestra solo las reglas de composición activadas, en orden", () => {
    expect(activePasswordRules(STRICT)).toEqual(["min_length", "uppercase", "lowercase", "number", "symbol"]);
  });

  it("cada regla de composición por separado, incluso fuera de ASCII", () => {
    expect(failedPasswordRules("sinmayusculas-123", STRICT)).toEqual(["uppercase"]);
    expect(failedPasswordRules("SINMINUSCULAS-123", STRICT)).toEqual(["lowercase"]);
    expect(failedPasswordRules("SinNumeros-Clave", STRICT)).toEqual(["number"]);
    expect(failedPasswordRules("SinSimbolos123ab", STRICT)).toEqual(["symbol"]);
    expect(failedPasswordRules("Ñandú-ÁRBOL-2026", STRICT)).toEqual([]);
  });

  it("cuenta caracteres después de NFKC, no unidades UTF-16", () => {
    expect(failedPasswordRules("🔒".repeat(12), LAX)).toEqual([]);
    expect(failedPasswordRules("🔒".repeat(11), LAX)).toEqual(["min_length"]);
  });

  it("el largo mínimo nunca baja de 8 ni pasa el máximo", () => {
    expect(effectiveMinLength({ ...LAX, minLength: 4 })).toBe(8);
    expect(effectiveMinLength({ ...LAX, minLength: 500 })).toBe(128);
    expect(failedPasswordRules("x".repeat(129), LAX)).toEqual(["max_length"]);
  });
});
