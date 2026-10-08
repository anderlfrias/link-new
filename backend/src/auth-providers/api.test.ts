import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_PROVIDER_API_VERSION, AuthProviderError, isAuthProviderError } from "./api";

describe("api.ts (el contrato público de los proveedores)", () => {
  // Un proveedor de otro repositorio copia este archivo tal cual: si importara algo
  // de LINK, la copia no compilaría.
  it("es autocontenido: no importa ni re-exporta nada", () => {
    const source = readFileSync(join(__dirname, "api.ts"), "utf8");

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\bfrom\s+["']/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it("la versión de la interfaz es un entero", () => {
    expect(Number.isInteger(AUTH_PROVIDER_API_VERSION)).toBe(true);
  });
});

describe("AuthProviderError", () => {
  it("lleva el motivo y, sin mensaje, el motivo como mensaje", () => {
    const error = new AuthProviderError("access_denied");

    expect(error.reason).toBe("access_denied");
    expect(error.message).toBe("access_denied");
    expect(error.name).toBe("AuthProviderError");
  });

  it("conserva el mensaje que se le da", () => {
    expect(new AuthProviderError("provider_error", "EXTERNAL_AUTH answered 502").message).toBe("EXTERNAL_AUTH answered 502");
  });
});

describe("isAuthProviderError", () => {
  it("reconoce un AuthProviderError de esta copia del archivo", () => {
    expect(isAuthProviderError(new AuthProviderError("invalid_credentials"))).toBe(true);
  });

  // Un proveedor cargado desde otro repositorio trae su propia copia de la clase.
  it("reconoce el de otra copia del archivo, por nombre y motivo", () => {
    class AuthProviderError extends Error {
      reason = "provider_unavailable";
      constructor() {
        super("otra copia");
        this.name = "AuthProviderError";
      }
    }

    expect(isAuthProviderError(new AuthProviderError())).toBe(true);
  });

  it("no confunde otros errores ni valores", () => {
    const wrongReason = Object.assign(new Error("x"), { name: "AuthProviderError", reason: "inventado" });
    const noReason = Object.assign(new Error("x"), { name: "AuthProviderError" });

    expect(isAuthProviderError(new Error("x"))).toBe(false);
    expect(isAuthProviderError(wrongReason)).toBe(false);
    expect(isAuthProviderError(noReason)).toBe(false);
    expect(isAuthProviderError({ name: "AuthProviderError", reason: "access_denied" })).toBe(false);
    expect(isAuthProviderError("access_denied")).toBe(false);
    expect(isAuthProviderError(null)).toBe(false);
    expect(isAuthProviderError(undefined)).toBe(false);
  });
});
