import { afterEach, describe, expect, it } from "vitest";
import { ServiceUnavailableError } from "../utils/errors";
import { createFakeProvider } from "../test/auth-mode";
import {
  currentProviderId,
  getAuthProvider,
  isExternalProvider,
  requireLocalAuth,
  setAuthProvider,
} from "./registry";

// src/test/setup.ts deja un proveedor de mentira activo: cada test restaura ese estado.
const original = getAuthProvider();
afterEach(() => setAuthProvider(original));

describe("registry", () => {
  it("con un proveedor externo: es externo, su id es el del proveedor y las cuentas locales no se pueden usar", () => {
    const provider = createFakeProvider({ id: "mi-proveedor" });
    setAuthProvider(provider);

    expect(getAuthProvider()).toBe(provider);
    expect(isExternalProvider()).toBe(true);
    expect(currentProviderId()).toBe("mi-proveedor");
    expect(() => requireLocalAuth()).toThrow(ServiceUnavailableError);
    try {
      requireLocalAuth();
    } catch (error) {
      expect((error as ServiceUnavailableError).code).toBe("local_auth_not_enabled");
    }
  });

  it("sin proveedor: cuentas locales, id 'local' y requireLocalAuth pasa", () => {
    setAuthProvider(null);

    expect(getAuthProvider()).toBeNull();
    expect(isExternalProvider()).toBe(false);
    expect(currentProviderId()).toBe("local");
    expect(() => requireLocalAuth()).not.toThrow();
  });
});
