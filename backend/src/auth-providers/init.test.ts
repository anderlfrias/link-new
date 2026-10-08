import { afterEach, describe, expect, it } from "vitest";
import { getAuthProvider, setAuthProvider } from "./registry";
import { initAuthProvider, isExternalProviderConfigured } from "./init";

// src/test/setup.ts deja un proveedor de mentira activo: cada test restaura ese estado.
const original = getAuthProvider();
afterEach(() => setAuthProvider(original));

const EXTERNAL_AUTH_ENV = {
  EXTERNAL_AUTH_API_URL: "https://external-auth.test.local",
  APP_CODE_EXTERNAL_AUTH: "test-app-code",
  EXTERNAL_AUTH_JWT_SECRET: "test-jwt-secret",
};

describe("isExternalProviderConfigured", () => {
  it("es verdadero con la configuración de un proveedor, aunque esté incompleta", () => {
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

  it("con el proveedor configurado lo valida, lo deja activo y lo devuelve", async () => {
    const provider = await initAuthProvider(EXTERNAL_AUTH_ENV);

    expect(provider?.id).toBe("external-auth");
    expect(getAuthProvider()).toBe(provider);
  });

  it("con la configuración del proveedor incompleta lanza: el backend no arranca", async () => {
    setAuthProvider(null);

    await expect(initAuthProvider({ EXTERNAL_AUTH_API_URL: "https://external-auth.test.local" })).rejects.toThrow(
      "Incomplete EXTERNAL_AUTH configuration",
    );
    // No deja a medias un proveedor sin validar.
    expect(getAuthProvider()).toBeNull();
  });
});
