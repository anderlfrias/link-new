import { describe, expect, it } from "vitest";
import { ServiceUnavailableError } from "../utils/errors";
import {
  AuthConfig,
  AuthConfigError,
  requireLocalAuth,
  requireExternalUserConfig,
  resolveAuthConfig,
  SESSION_JWT_SECRET_MIN_LENGTH,
} from "./auth-config";

const EXTERNAL_AUTH_VARS = {
  EXTERNAL_AUTH_API_URL: "https://external-auth.example.com",
  APP_CODE_EXTERNAL_AUTH: "chat-interno",
  EXTERNAL_AUTH_JWT_SECRET: "external-auth-secret",
};

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
  it("con las tres EXTERNAL_AUTH_* y SESSION_JWT_SECRET -> modo external-auth con sus valores, sin avisos", () => {
    const result = resolveAuthConfig({ ...EXTERNAL_AUTH_VARS, SESSION_JWT_SECRET: VALID_SECRET });

    expect(result).toEqual({
      config: {
        mode: "external-auth",
        sessionSecret: VALID_SECRET,
        external-auth: { apiUrl: "https://external-auth.example.com", appCode: "chat-interno", jwtSecret: "external-auth-secret" },
      },
      warnings: [],
    });
  });

  it("sin ninguna EXTERNAL_AUTH_* y con SESSION_JWT_SECRET -> modo local", () => {
    const result = resolveAuthConfig({ SESSION_JWT_SECRET: VALID_SECRET });

    expect(result).toEqual({
      config: { mode: "local", sessionSecret: VALID_SECRET },
      warnings: [],
    });
  });

  it("el secreto de sesión es obligatorio también en modo external-auth", () => {
    const error = captureAuthConfigError(() => resolveAuthConfig(EXTERNAL_AUTH_VARS));

    expect(error.errors).toHaveLength(1);
    expect(error.errors[0]).toContain("SESSION_JWT_SECRET is required");
  });

  it("sin nada configurado -> error que pide el secreto de sesión", () => {
    const error = captureAuthConfigError(() => resolveAuthConfig({}));

    expect(error.errors[0]).toContain("SESSION_JWT_SECRET is required");
  });

  it.each([
    ["modo local", {}],
    ["modo external-auth", EXTERNAL_AUTH_VARS],
  ])("%s con un secreto de 31 caracteres -> error de largo mínimo", (_label, vars) => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ ...vars, SESSION_JWT_SECRET: "s".repeat(SESSION_JWT_SECRET_MIN_LENGTH - 1) }),
    );

    expect(error.errors[0]).toContain(`at least ${SESSION_JWT_SECRET_MIN_LENGTH} characters`);
  });

  it("LOCAL_AUTH_JWT_SECRET sigue valiendo como secreto de sesión, con aviso de que está deprecado", () => {
    const result = resolveAuthConfig({ LOCAL_AUTH_JWT_SECRET: VALID_SECRET });

    expect(result.config).toEqual({ mode: "local", sessionSecret: VALID_SECRET });
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

  it("solo EXTERNAL_AUTH_API_URL -> error que nombra exactamente las dos que faltan", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ EXTERNAL_AUTH_API_URL: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL, SESSION_JWT_SECRET: VALID_SECRET }),
    );

    expect(error.errors[0]).toContain("Incomplete EXTERNAL_AUTH configuration: missing APP_CODE_EXTERNAL_AUTH, EXTERNAL_AUTH_JWT_SECRET.");
  });

  it("falta solo EXTERNAL_AUTH_JWT_SECRET -> error que nombra solo esa", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({
        EXTERNAL_AUTH_API_URL: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL,
        APP_CODE_EXTERNAL_AUTH: EXTERNAL_AUTH_VARS.APP_CODE_EXTERNAL_AUTH,
        SESSION_JWT_SECRET: VALID_SECRET,
      }),
    );

    expect(error.errors[0]).toContain("missing EXTERNAL_AUTH_JWT_SECRET.");
  });

  it("EXTERNAL_AUTH a medias nunca cae a modo local, aunque haya un secreto de sesión válido", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ EXTERNAL_AUTH_JWT_SECRET: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_JWT_SECRET, SESSION_JWT_SECRET: VALID_SECRET }),
    );

    expect(error.errors[0]).toContain("Incomplete EXTERNAL_AUTH configuration");
  });
});

describe("requireExternalUserConfig", () => {
  it("en modo external-auth devuelve su configuración", () => {
    const { config } = resolveAuthConfig({ ...EXTERNAL_AUTH_VARS, SESSION_JWT_SECRET: VALID_SECRET });

    expect(requireExternalUserConfig(config)).toEqual({
      apiUrl: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL,
      appCode: EXTERNAL_AUTH_VARS.APP_CODE_EXTERNAL_AUTH,
      jwtSecret: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_JWT_SECRET,
    });
  });

  it("en modo local tira ServiceUnavailableError con code external-auth_not_configured", () => {
    const localConfig: AuthConfig = { mode: "local", sessionSecret: VALID_SECRET };

    let thrown: unknown;
    try {
      requireExternalUserConfig(localConfig);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ServiceUnavailableError);
    expect((thrown as ServiceUnavailableError).code).toBe("external-auth_not_configured");
  });
});

describe("requireLocalAuth", () => {
  it("en modo local no tira", () => {
    expect(() => requireLocalAuth({ mode: "local", sessionSecret: VALID_SECRET })).not.toThrow();
  });

  it("en modo external-auth tira ServiceUnavailableError con code local_auth_not_enabled", () => {
    const { config } = resolveAuthConfig({ ...EXTERNAL_AUTH_VARS, SESSION_JWT_SECRET: VALID_SECRET });

    let thrown: unknown;
    try {
      requireLocalAuth(config);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ServiceUnavailableError);
    expect((thrown as ServiceUnavailableError).code).toBe("local_auth_not_enabled");
  });
});
