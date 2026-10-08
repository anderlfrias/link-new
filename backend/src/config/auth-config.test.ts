import { describe, expect, it } from "vitest";
import { AuthConfigError, resolveAuthConfig, SESSION_JWT_SECRET_MIN_LENGTH } from "./auth-config";

const VALID_SECRET = "s".repeat(SESSION_JWT_SECRET_MIN_LENGTH);

function captureAuthConfigError(fn: () => unknown): AuthConfigError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AuthConfigError) return error;
    throw error;
  }
  throw new Error("se esperaba un AuthConfigError");
}

describe("resolveAuthConfig", () => {
  it("con SESSION_JWT_SECRET devuelve la configuración, sin avisos", () => {
    expect(resolveAuthConfig({ SESSION_JWT_SECRET: VALID_SECRET })).toEqual({
      config: { sessionSecret: VALID_SECRET },
      warnings: [],
    });
  });

  it("sin ningún secreto -> error que pide SESSION_JWT_SECRET (es obligatorio con cualquier proveedor)", () => {
    const error = captureAuthConfigError(() => resolveAuthConfig({}));

    expect(error.errors).toHaveLength(1);
    expect(error.errors[0]).toContain("SESSION_JWT_SECRET is required");
  });

  it("un secreto de 31 caracteres -> error de largo mínimo", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ SESSION_JWT_SECRET: "s".repeat(SESSION_JWT_SECRET_MIN_LENGTH - 1) }),
    );

    expect(error.errors[0]).toContain(`at least ${SESSION_JWT_SECRET_MIN_LENGTH} characters`);
  });

  it("LOCAL_AUTH_JWT_SECRET sigue valiendo como secreto de sesión, con aviso de que está deprecado", () => {
    const result = resolveAuthConfig({ LOCAL_AUTH_JWT_SECRET: VALID_SECRET });

    expect(result.config).toEqual({ sessionSecret: VALID_SECRET });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("rename it to SESSION_JWT_SECRET");
  });

  it("el alias deprecado también pasa por el largo mínimo", () => {
    const error = captureAuthConfigError(() => resolveAuthConfig({ LOCAL_AUTH_JWT_SECRET: "corto" }));

    expect(error.errors[0]).toContain(`at least ${SESSION_JWT_SECRET_MIN_LENGTH} characters`);
  });

  it("con las dos variables gana SESSION_JWT_SECRET y se avisa que la vieja se ignora", () => {
    const other = "o".repeat(SESSION_JWT_SECRET_MIN_LENGTH);
    const result = resolveAuthConfig({ SESSION_JWT_SECRET: VALID_SECRET, LOCAL_AUTH_JWT_SECRET: other });

    expect(result.config.sessionSecret).toBe(VALID_SECRET);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("ignored");
  });
});
