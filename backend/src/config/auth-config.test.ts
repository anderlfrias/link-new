import { describe, expect, it } from "vitest";
import { ServiceUnavailableError } from "../utils/errors";
import {
  AuthConfig,
  AuthConfigError,
  getAuthJwtSecret,
  LOCAL_AUTH_JWT_SECRET_MIN_LENGTH,
  requireLocalConfig,
  requireExternalUserConfig,
  resolveAuthConfig,
} from "./auth-config";

const EXTERNAL_AUTH_VARS = {
  EXTERNAL_AUTH_API_URL: "https://external-auth.example.com",
  APP_CODE_EXTERNAL_AUTH: "chat-interno",
  EXTERNAL_AUTH_JWT_SECRET: "external-auth-secret",
};

const VALID_LOCAL_SECRET = "s".repeat(LOCAL_AUTH_JWT_SECRET_MIN_LENGTH);

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
  it("con las tres EXTERNAL_AUTH_* -> modo external-auth con sus valores, sin avisos", () => {
    const result = resolveAuthConfig(EXTERNAL_AUTH_VARS);

    expect(result).toEqual({
      config: {
        mode: "external-auth",
        external-auth: { apiUrl: "https://external-auth.example.com", appCode: "chat-interno", jwtSecret: "external-auth-secret" },
      },
      warnings: [],
    });
  });

  it("modo external-auth con LOCAL_AUTH_JWT_SECRET sobrante -> lo ignora y deja un aviso", () => {
    const result = resolveAuthConfig({ ...EXTERNAL_AUTH_VARS, LOCAL_AUTH_JWT_SECRET: VALID_LOCAL_SECRET });

    expect(result.config.mode).toBe("external-auth");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("LOCAL_AUTH_JWT_SECRET");
  });

  it("modo external-auth con un LOCAL_AUTH_JWT_SECRET corto -> no falla (en este modo no se usa)", () => {
    const result = resolveAuthConfig({ ...EXTERNAL_AUTH_VARS, LOCAL_AUTH_JWT_SECRET: "corto" });

    expect(result.config.mode).toBe("external-auth");
  });

  it("sin ninguna EXTERNAL_AUTH_* y con LOCAL_AUTH_JWT_SECRET -> modo local", () => {
    const result = resolveAuthConfig({ LOCAL_AUTH_JWT_SECRET: VALID_LOCAL_SECRET });

    expect(result).toEqual({
      config: { mode: "local", local: { jwtSecret: VALID_LOCAL_SECRET } },
      warnings: [],
    });
  });

  it("sin ninguna EXTERNAL_AUTH_* ni LOCAL_AUTH_JWT_SECRET -> error que pide el secreto local", () => {
    const error = captureAuthConfigError(() => resolveAuthConfig({}));

    expect(error.errors).toHaveLength(1);
    expect(error.errors[0]).toContain("LOCAL_AUTH_JWT_SECRET is required");
  });

  it("modo local con un secreto de 31 caracteres -> error de largo mínimo", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ LOCAL_AUTH_JWT_SECRET: "s".repeat(LOCAL_AUTH_JWT_SECRET_MIN_LENGTH - 1) }),
    );

    expect(error.errors[0]).toContain(`at least ${LOCAL_AUTH_JWT_SECRET_MIN_LENGTH} characters`);
  });

  it("solo EXTERNAL_AUTH_API_URL -> error que nombra exactamente las dos que faltan", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ EXTERNAL_AUTH_API_URL: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL }),
    );

    expect(error.errors[0]).toContain("Incomplete EXTERNAL_AUTH configuration: missing APP_CODE_EXTERNAL_AUTH, EXTERNAL_AUTH_JWT_SECRET.");
  });

  it("falta solo EXTERNAL_AUTH_JWT_SECRET -> error que nombra solo esa", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ EXTERNAL_AUTH_API_URL: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL, APP_CODE_EXTERNAL_AUTH: EXTERNAL_AUTH_VARS.APP_CODE_EXTERNAL_AUTH }),
    );

    expect(error.errors[0]).toContain("missing EXTERNAL_AUTH_JWT_SECRET.");
  });

  it("EXTERNAL_AUTH a medias nunca cae a modo local, aunque haya un secreto local válido", () => {
    const error = captureAuthConfigError(() =>
      resolveAuthConfig({ EXTERNAL_AUTH_JWT_SECRET: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_JWT_SECRET, LOCAL_AUTH_JWT_SECRET: VALID_LOCAL_SECRET }),
    );

    expect(error.errors[0]).toContain("Incomplete EXTERNAL_AUTH configuration");
  });
});

describe("requireExternalUserConfig", () => {
  it("en modo external-auth devuelve su configuración", () => {
    const { config } = resolveAuthConfig(EXTERNAL_AUTH_VARS);

    expect(requireExternalUserConfig(config)).toEqual({
      apiUrl: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL,
      appCode: EXTERNAL_AUTH_VARS.APP_CODE_EXTERNAL_AUTH,
      jwtSecret: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_JWT_SECRET,
    });
  });

  it("en modo local tira ServiceUnavailableError con code external-auth_not_configured", () => {
    const localConfig: AuthConfig = { mode: "local", local: { jwtSecret: VALID_LOCAL_SECRET } };

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

describe("getAuthJwtSecret", () => {
  it("en modo external-auth devuelve EXTERNAL_AUTH_JWT_SECRET", () => {
    const { config } = resolveAuthConfig(EXTERNAL_AUTH_VARS);

    expect(getAuthJwtSecret(config)).toBe(EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_JWT_SECRET);
  });

  it("en modo local devuelve LOCAL_AUTH_JWT_SECRET", () => {
    const { config } = resolveAuthConfig({ LOCAL_AUTH_JWT_SECRET: VALID_LOCAL_SECRET });

    expect(getAuthJwtSecret(config)).toBe(VALID_LOCAL_SECRET);
  });
});

describe("requireLocalConfig", () => {
  it("devuelve la config local en modo local", () => {
    expect(requireLocalConfig({ mode: "local", local: { jwtSecret: "s".repeat(32) } })).toEqual({
      jwtSecret: "s".repeat(32),
    });
  });

  it("en modo external-auth tira ServiceUnavailableError con code local_auth_not_enabled", () => {
    const config = { mode: "external-auth" as const, external-auth: { apiUrl: "https://x.test", appCode: "app", jwtSecret: "x" } };

    expect(() => requireLocalConfig(config)).toThrow(ServiceUnavailableError);
    try {
      requireLocalConfig(config);
    } catch (error) {
      expect((error as ServiceUnavailableError).code).toBe("local_auth_not_enabled");
    }
  });
});
