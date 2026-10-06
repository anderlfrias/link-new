import { randomBytes, scryptSync } from "crypto";
import { describe, expect, it } from "vitest";
import {
  evaluatePasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  isPasswordReused,
  PASSWORD_MAX_LENGTH,
  PasswordPolicy,
  verifyPassword,
} from "./password";

const LAX_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
};

const STRICTEST_POLICY: PasswordPolicy = {
  minLength: PASSWORD_MAX_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

/// Un hash en el formato de password.ts, pero con otros parámetros de scrypt
/// (como los que quedarían en la base si algún día se suben los actuales).
function hashWithParams(password: string, N: number, r: number, p: number): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 32, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

describe("hashPassword / verifyPassword", () => {
  it("round-trip: la misma contraseña verifica, sin pedir rehash", async () => {
    const stored = await hashPassword("caballo correcto batería grapa");

    expect(stored).toMatch(/^scrypt\$16384\$8\$5\$[\w-]+\$[\w-]+$/);
    await expect(verifyPassword("caballo correcto batería grapa", stored)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it("una contraseña incorrecta no verifica", async () => {
    const stored = await hashPassword("caballo correcto batería grapa");

    await expect(verifyPassword("caballo correcto bateria grapa", stored)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("dos hashes de la misma contraseña son distintos (salt aleatorio)", async () => {
    const [a, b] = await Promise.all([hashPassword("misma-clave-123"), hashPassword("misma-clave-123")]);

    expect(a).not.toBe(b);
  });

  it("un hash adulterado o de formato desconocido no verifica, y no tira", async () => {
    const stored = await hashPassword("caballo correcto batería grapa");
    const parts = stored.split("$");
    const tamperedKey = [...parts.slice(0, 5), Buffer.alloc(32, 1).toString("base64url")].join("$");

    for (const bad of [
      tamperedKey,
      "bcrypt$2b$10$abc",
      "scrypt$16384$8$5$solo-salt",
      "scrypt$1000$8$5$c2FsdA$aGFzaA", // N que no es potencia de 2
      "scrypt$1048576$8$5$c2FsdA$aGFzaA", // pediría 1 GiB de memoria
      "scrypt$16384$8$999$c2FsdA$aGFzaA", // p desmedido
      "",
    ]) {
      await expect(verifyPassword("caballo correcto batería grapa", bad)).resolves.toEqual({
        valid: false,
        needsRehash: false,
      });
    }
  });

  it("needsRehash cuando el hash usa parámetros viejos y la contraseña es correcta", async () => {
    const old = hashWithParams("clave-de-antes-2020", 2 ** 10, 8, 1);

    await expect(verifyPassword("clave-de-antes-2020", old)).resolves.toEqual({ valid: true, needsRehash: true });
    await expect(verifyPassword("otra-clave", old)).resolves.toEqual({ valid: false, needsRehash: false });
  });

  it("normaliza a NFKC: formas equivalentes de la misma contraseña verifican", async () => {
    // "é" precompuesta (U+00E9) contra "e" + tilde combinante (U+0301), y
    // dígitos de ancho completo contra ASCII.
    const stored = await hashPassword("café １２３");

    await expect(verifyPassword("café 123", stored)).resolves.toMatchObject({ valid: true });
  });

  it("una contraseña más larga que el máximo no verifica (sin calcular el hash)", async () => {
    const stored = await hashPassword("x".repeat(PASSWORD_MAX_LENGTH));

    await expect(verifyPassword("x".repeat(PASSWORD_MAX_LENGTH), stored)).resolves.toMatchObject({ valid: true });
    await expect(verifyPassword("x".repeat(PASSWORD_MAX_LENGTH + 1), stored)).resolves.toMatchObject({
      valid: false,
    });
  });
});

describe("evaluatePasswordPolicy", () => {
  it("una contraseña que cumple todo no incumple ninguna regla", () => {
    expect(evaluatePasswordPolicy("Clave-segura-2026", { ...STRICTEST_POLICY, minLength: 12 })).toEqual([]);
  });

  it("aplica el piso de 8 aunque la política pida menos", () => {
    expect(evaluatePasswordPolicy("1234567", { ...LAX_POLICY, minLength: 4 })).toEqual(["min_length"]);
    expect(evaluatePasswordPolicy("12345678", { ...LAX_POLICY, minLength: 4 })).toEqual([]);
  });

  it("aplica el máximo de 128 aunque la política pida más", () => {
    expect(evaluatePasswordPolicy("x".repeat(129), { ...LAX_POLICY, minLength: 500 })).toEqual(["max_length"]);
    expect(evaluatePasswordPolicy("x".repeat(128), { ...LAX_POLICY, minLength: 500 })).toEqual([]);
  });

  it("cuenta caracteres, no unidades UTF-16: ocho emojis son ocho caracteres", () => {
    expect(evaluatePasswordPolicy("🔒".repeat(8), LAX_POLICY)).toEqual([]);
    expect(evaluatePasswordPolicy("🔒".repeat(7), LAX_POLICY)).toEqual(["min_length"]);
  });

  it("cada regla de composición, por separado", () => {
    expect(evaluatePasswordPolicy("sinmayusculas1!", { ...LAX_POLICY, requireUppercase: true })).toEqual(["uppercase"]);
    expect(evaluatePasswordPolicy("SINMINUSCULAS1!", { ...LAX_POLICY, requireLowercase: true })).toEqual(["lowercase"]);
    expect(evaluatePasswordPolicy("SinNumeros-ok!", { ...LAX_POLICY, requireNumber: true })).toEqual(["number"]);
    expect(evaluatePasswordPolicy("SinSimbolos123", { ...LAX_POLICY, requireSymbol: true })).toEqual(["symbol"]);
  });

  it("reconoce letras y símbolos fuera de ASCII", () => {
    expect(evaluatePasswordPolicy("ñandú-ÁRBOL-9", STRICTEST_POLICY)).toEqual(["min_length"]);
    expect(evaluatePasswordPolicy("contraseña con espacios", { ...LAX_POLICY, requireSymbol: true })).toEqual([]);
  });

  it("devuelve todas las reglas incumplidas a la vez", () => {
    expect(evaluatePasswordPolicy("abc", STRICTEST_POLICY)).toEqual(["min_length", "uppercase", "number", "symbol"]);
  });
});

describe("isPasswordReused", () => {
  it("detecta una contraseña anterior y no confunde una distinta", async () => {
    const previous = await Promise.all([hashPassword("vieja-uno-2024"), hashPassword("vieja-dos-2025")]);

    await expect(isPasswordReused("vieja-dos-2025", previous)).resolves.toBe(true);
    await expect(isPasswordReused("nueva-tres-2026", previous)).resolves.toBe(false);
    await expect(isPasswordReused("vieja-uno-2024", [])).resolves.toBe(false);
  });
});

describe("generateTemporaryPassword", () => {
  it("cumple la política más estricta posible", () => {
    const password = generateTemporaryPassword(STRICTEST_POLICY);

    expect(password).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(evaluatePasswordPolicy(password, STRICTEST_POLICY)).toEqual([]);
  });

  it("tiene al menos 16 caracteres y todas las clases, aunque la política sea laxa", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword(LAX_POLICY);

      expect(password).toHaveLength(16);
      expect(evaluatePasswordPolicy(password, { ...STRICTEST_POLICY, minLength: 16 })).toEqual([]);
    }
  });

  it("no usa caracteres ambiguos ni comillas, espacios o barras", () => {
    const sample = Array.from({ length: 50 }, () => generateTemporaryPassword(LAX_POLICY)).join("");

    expect(sample).not.toMatch(/[Il1O0'"`\s\\/]/);
  });

  it("no repite contraseñas", () => {
    const generated = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword(LAX_POLICY)));

    expect(generated.size).toBe(100);
  });
});
