import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAuthProvider, setAuthProvider } from "./registry";
import { authProviderModule, initAuthProvider, isExternalProviderConfigured } from "./init";
import { AuthProviderLoadError } from "./loader";

// Por defecto los tests corren con cuentas locales: cada test restaura ese estado.
const original = getAuthProvider();
afterEach(() => {
  setAuthProvider(original);
});

const EXAMPLE_MODULE = join(__dirname, "example", "index");

describe("authProviderModule", () => {
  it("es AUTH_PROVIDER_MODULE, sin espacios alrededor", () => {
    expect(authProviderModule({ AUTH_PROVIDER_MODULE: `  ${EXAMPLE_MODULE}  ` })).toBe(EXAMPLE_MODULE);
  });

  it("sin nada configurado, o con la variable vacía o en blanco, son cuentas locales", () => {
    expect(authProviderModule({})).toBeUndefined();
    expect(authProviderModule({ AUTH_PROVIDER_MODULE: "" })).toBeUndefined();
    expect(authProviderModule({ AUTH_PROVIDER_MODULE: "   " })).toBeUndefined();
  });

  it("las variables propias de un proveedor no lo eligen: solo AUTH_PROVIDER_MODULE", () => {
    expect(authProviderModule({ MI_PROVEEDOR_URL: "https://auth.example.com" })).toBeUndefined();
  });
});

describe("isExternalProviderConfigured", () => {
  it("es verdadero con AUTH_PROVIDER_MODULE", () => {
    expect(isExternalProviderConfigured({ AUTH_PROVIDER_MODULE: EXAMPLE_MODULE })).toBe(true);
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

  it("un módulo inexistente lanza: el backend no arranca, y no deja nada activo", async () => {
    setAuthProvider(null);

    await expect(initAuthProvider({ AUTH_PROVIDER_MODULE: join(__dirname, "no-existe") })).rejects.toBeInstanceOf(
      AuthProviderLoadError,
    );
    expect(getAuthProvider()).toBeNull();
  });

  it("un proveedor cuyo init lanza impide el arranque, y el mensaje dice por qué", async () => {
    setAuthProvider(null);
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      // El de ejemplo se niega a arrancar en producción.
      await expect(initAuthProvider({ AUTH_PROVIDER_MODULE: EXAMPLE_MODULE })).rejects.toThrow(
        'The "example" auth provider could not start',
      );
    } finally {
      process.env.NODE_ENV = original;
    }
    expect(getAuthProvider()).toBeNull();
  });
});
