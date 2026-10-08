import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthEnvVars } from "./auth-config";

// env.ts valida process.env una sola vez al importarse, así que cada caso
// resetea el registro de módulos y lo reimporta (mismo patrón que
// cors-origins.test.ts). Las cinco variables de autenticación se fijan
// siempre de forma explícita (vacía = "no definida"): así el resultado no
// depende del .env local de quien corre los tests, porque dotenv no pisa
// variables que ya existen.
function stubAuthEnv(vars: AuthEnvVars) {
  vi.stubEnv("EXTERNAL_AUTH_API_URL", vars.EXTERNAL_AUTH_API_URL ?? "");
  vi.stubEnv("APP_CODE_EXTERNAL_AUTH", vars.APP_CODE_EXTERNAL_AUTH ?? "");
  vi.stubEnv("EXTERNAL_AUTH_JWT_SECRET", vars.EXTERNAL_AUTH_JWT_SECRET ?? "");
  vi.stubEnv("SESSION_JWT_SECRET", vars.SESSION_JWT_SECRET ?? "");
  vi.stubEnv("LOCAL_AUTH_JWT_SECRET", vars.LOCAL_AUTH_JWT_SECRET ?? "");
}

async function importFreshEnv() {
  vi.resetModules();
  return import("./env");
}

/// env.ts corta el arranque con process.exit(1): acá se reemplaza por un throw
/// para poder verificar qué imprimió sin matar el proceso de test.
function spyOnFatalExit() {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  return { exitSpy, consoleErrorSpy };
}

const SESSION_SECRET = "s".repeat(32);

const EXTERNAL_AUTH_VARS = {
  EXTERNAL_AUTH_API_URL: "https://external-auth.test.local",
  APP_CODE_EXTERNAL_AUTH: "test-app-code",
  EXTERNAL_AUTH_JWT_SECRET: "test-jwt-secret",
  SESSION_JWT_SECRET: SESSION_SECRET,
};

const OLD_LOCAL_SECRET = "l".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("config/env — modo de autenticación", () => {
  it("con las tres EXTERNAL_AUTH_* -> modo external-auth, sin exponer las variables de auth sueltas", async () => {
    stubAuthEnv(EXTERNAL_AUTH_VARS);

    const { default: env, envWarnings } = await importFreshEnv();

    expect(env.auth).toEqual({
      mode: "external-auth",
      sessionSecret: SESSION_SECRET,
      external-auth: { apiUrl: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL, appCode: EXTERNAL_AUTH_VARS.APP_CODE_EXTERNAL_AUTH, jwtSecret: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_JWT_SECRET },
    });
    expect(env).not.toHaveProperty("EXTERNAL_AUTH_API_URL");
    expect(env).not.toHaveProperty("APP_CODE_EXTERNAL_AUTH");
    expect(env).not.toHaveProperty("EXTERNAL_AUTH_JWT_SECRET");
    expect(env).not.toHaveProperty("SESSION_JWT_SECRET");
    expect(env).not.toHaveProperty("LOCAL_AUTH_JWT_SECRET");
    expect(env.PORT).toBe(4000);
    expect(envWarnings).toEqual([]);
  });

  it("con las EXTERNAL_AUTH_* vacías y SESSION_JWT_SECRET -> modo local (vacía cuenta como no definida)", async () => {
    stubAuthEnv({ SESSION_JWT_SECRET: SESSION_SECRET });

    const { default: env, envWarnings } = await importFreshEnv();

    expect(env.auth).toEqual({ mode: "local", sessionSecret: SESSION_SECRET });
    expect(envWarnings).toEqual([]);
  });

  it("LOCAL_AUTH_JWT_SECRET (nombre anterior) sigue valiendo como secreto de sesión, con un aviso en envWarnings", async () => {
    stubAuthEnv({ LOCAL_AUTH_JWT_SECRET: OLD_LOCAL_SECRET });

    const { default: env, envWarnings } = await importFreshEnv();

    expect(env.auth).toEqual({ mode: "local", sessionSecret: OLD_LOCAL_SECRET });
    expect(envWarnings).toHaveLength(1);
    expect(envWarnings[0]).toContain("SESSION_JWT_SECRET");
  });

  it("modo external-auth sin SESSION_JWT_SECRET -> imprime que falta y corta el arranque", async () => {
    stubAuthEnv({ ...EXTERNAL_AUTH_VARS, SESSION_JWT_SECRET: undefined });
    const { consoleErrorSpy } = spyOnFatalExit();

    await expect(importFreshEnv()).rejects.toThrow("process.exit(1)");

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_JWT_SECRET is required"));
  });

  it("EXTERNAL_AUTH a medias -> imprime el motivo y corta el arranque", async () => {
    stubAuthEnv({ EXTERNAL_AUTH_API_URL: EXTERNAL_AUTH_VARS.EXTERNAL_AUTH_API_URL });
    const { exitSpy, consoleErrorSpy } = spyOnFatalExit();

    await expect(importFreshEnv()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Incomplete EXTERNAL_AUTH configuration: missing APP_CODE_EXTERNAL_AUTH, EXTERNAL_AUTH_JWT_SECRET."),
    );
  });

  it("sin EXTERNAL_AUTH_* ni SESSION_JWT_SECRET -> imprime que falta el secreto de sesión y corta el arranque", async () => {
    stubAuthEnv({});
    const { consoleErrorSpy } = spyOnFatalExit();

    await expect(importFreshEnv()).rejects.toThrow("process.exit(1)");

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_JWT_SECRET is required"));
  });

  it("SESSION_JWT_SECRET de menos de 32 caracteres -> imprime el largo mínimo y corta el arranque", async () => {
    stubAuthEnv({ SESSION_JWT_SECRET: "corto" });
    const { consoleErrorSpy } = spyOnFatalExit();

    await expect(importFreshEnv()).rejects.toThrow("process.exit(1)");

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("at least 32 characters"));
  });

  it("EXTERNAL_AUTH_API_URL que no es una URL -> lo sigue rechazando el schema", async () => {
    stubAuthEnv({ ...EXTERNAL_AUTH_VARS, EXTERNAL_AUTH_API_URL: "not-a-url" });
    const { consoleErrorSpy } = spyOnFatalExit();

    await expect(importFreshEnv()).rejects.toThrow("process.exit(1)");

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("EXTERNAL_AUTH_API_URL must be a valid URL"));
  });
});

describe("config/env — CORS_ORIGIN según NODE_ENV", () => {
  it("con NODE_ENV=production y sin CORS_ORIGIN -> imprime el motivo y corta el arranque", async () => {
    stubAuthEnv(EXTERNAL_AUTH_VARS);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ORIGIN", "");
    const { exitSpy, consoleErrorSpy } = spyOnFatalExit();

    await expect(importFreshEnv()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("CORS_ORIGIN is required when NODE_ENV=production"),
    );
  });

  it("con NODE_ENV=production y CORS_ORIGIN definida -> arranca", async () => {
    stubAuthEnv(EXTERNAL_AUTH_VARS);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ORIGIN", "https://chat.example.com");

    const { default: env } = await importFreshEnv();

    expect(env.CORS_ORIGIN).toBe("https://chat.example.com");
  });

  it("con NODE_ENV=production y CORS_ORIGIN=\"*\" -> arranca (abierto a propósito)", async () => {
    stubAuthEnv(EXTERNAL_AUTH_VARS);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ORIGIN", "*");

    const { default: env } = await importFreshEnv();

    expect(env.CORS_ORIGIN).toBe("*");
  });

  it("fuera de producción, sin CORS_ORIGIN -> arranca igual (cómodo en dev/LAN)", async () => {
    stubAuthEnv(EXTERNAL_AUTH_VARS);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CORS_ORIGIN", "");

    const { default: env } = await importFreshEnv();

    expect(env.CORS_ORIGIN).toBeUndefined();
  });
});
