import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthProvider, setAuthProvider } from "./registry";
import { authProviderModule, initAuthProvider, isExternalProviderConfigured } from "./init";
import { AuthProviderLoadError } from "./loader";

// src/test/setup.ts deja un proveedor de mentira activo: cada test restaura ese estado.
const original = getAuthProvider();
afterEach(() => {
  setAuthProvider(original);
  vi.unstubAllEnvs();
});

const EXAMPLE_MODULE = join(__dirname, "example", "index");

const EXTERNAL_AUTH_ENV = {
  EXTERNAL_AUTH_API_URL: "https://external-auth.test.local",
  APP_CODE_EXTERNAL_AUTH: "test-app-code",
  EXTERNAL_AUTH_JWT_SECRET: "test-jwt-secret",
};

function stubExternalUserEnv(vars: Record<string, string> = EXTERNAL_AUTH_ENV) {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
}

describe("authProviderModule", () => {
  it("AUTH_PROVIDER_MODULE manda, sin espacios alrededor", () => {
    expect(authProviderModule({ AUTH_PROVIDER_MODULE: `  ${EXAMPLE_MODULE}  ` })).toBe(EXAMPLE_MODULE);
  });

  it("AUTH_PROVIDER_MODULE gana sobre la configuración del proveedor interno de EXTERNAL_AUTH", () => {
    expect(authProviderModule({ ...EXTERNAL_AUTH_ENV, AUTH_PROVIDER_MODULE: EXAMPLE_MODULE })).toBe(EXAMPLE_MODULE);
  });

  it("sin AUTH_PROVIDER_MODULE, la configuración de EXTERNAL_AUTH elige el proveedor interno (temporal)", () => {
    expect(authProviderModule(EXTERNAL_AUTH_ENV)).toMatch(/external-auth[\\/]index$/);
  });

  it("sin nada configurado, o con las variables vacías, son cuentas locales", () => {
    expect(authProviderModule({})).toBeUndefined();
    expect(authProviderModule({ AUTH_PROVIDER_MODULE: "  ", EXTERNAL_AUTH_API_URL: "" })).toBeUndefined();
  });
});

describe("isExternalProviderConfigured", () => {
  it("es verdadero con AUTH_PROVIDER_MODULE o con la configuración de un proveedor, aunque esté incompleta", () => {
    expect(isExternalProviderConfigured({ AUTH_PROVIDER_MODULE: EXAMPLE_MODULE })).toBe(true);
    expect(isExternalProviderConfigured(EXTERNAL_AUTH_ENV)).toBe(true);
    expect(isExternalProviderConfigured({ EXTERNAL_AUTH_API_URL: "https://external-auth.test.local" })).toBe(true);
  });

  it("sin configuración de ningún proveedor es falso", () => {
    expect(isExternalProviderConfigured({})).toBe(false);
  });
});

describe("initAuthProvider", () => {
  it("sin proveedor configurado deja las cuentas locales", async () => {
    await expect(initAuthProvider({})).resolves.toBeNull();

    expect(getAuthProvider()).toBeNull();
  });

  it("con AUTH_PROVIDER_MODULE carga el plugin, lo deja activo y lo devuelve", async () => {
    const provider = await initAuthProvider({ AUTH_PROVIDER_MODULE: EXAMPLE_MODULE });

    expect(provider?.id).toBe("example");
    expect(getAuthProvider()).toBe(provider);
  });

  it("el proveedor interno de EXTERNAL_AUTH se carga por la misma vía que cualquier plugin", async () => {
    stubExternalUserEnv();

    const provider = await initAuthProvider(EXTERNAL_AUTH_ENV);

    expect(provider?.id).toBe("external-auth");
    expect(getAuthProvider()).toBe(provider);
  });

  it("un módulo inexistente lanza: el backend no arranca, y no deja nada activo", async () => {
    setAuthProvider(null);

    await expect(initAuthProvider({ AUTH_PROVIDER_MODULE: join(__dirname, "no-existe") })).rejects.toBeInstanceOf(
      AuthProviderLoadError,
    );
    expect(getAuthProvider()).toBeNull();
  });

  it("con la configuración del proveedor incompleta lanza, y el mensaje dice qué falta", async () => {
    setAuthProvider(null);
    stubExternalUserEnv({ EXTERNAL_AUTH_API_URL: "https://external-auth.test.local", APP_CODE_EXTERNAL_AUTH: "", EXTERNAL_AUTH_JWT_SECRET: "" });

    await expect(initAuthProvider({ EXTERNAL_AUTH_API_URL: "https://external-auth.test.local" })).rejects.toThrow(
      "Incomplete EXTERNAL_AUTH configuration: missing APP_CODE_EXTERNAL_AUTH, EXTERNAL_AUTH_JWT_SECRET.",
    );
    // No deja a medias un proveedor sin validar.
    expect(getAuthProvider()).toBeNull();
  });
});
