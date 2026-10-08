import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { TEST_SESSION_JWT_SECRET, useLocalAuth } from "../../test/auth-mode";
import { SESSION_TOKEN_AUDIENCE, SESSION_TOKEN_ISSUER, signSessionToken, verifyAccessToken } from "./jwt";

// El secreto con el que un proveedor externo firma su propio token: no es el de sesión de LINK.
const PROVIDER_JWT_SECRET = "provider-own-secret";

function providerTokenPayload() {
  return {
    id: "ext-user-1",
    email: "test@example.com",
    username: "testuser",
    name: "Juan",
    roles: [{ role: "admin" }],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

describe("signSessionToken", () => {
  it("firma HS256 con sub, email, iss, aud, iat y exp según la duración", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 12, mustChangePassword: false });

    const decoded = jwt.decode(token, { complete: true })!;
    const payload = decoded.payload as jwt.JwtPayload;
    expect(decoded.header.alg).toBe("HS256");
    expect(payload).toMatchObject({ sub: "user-1", email: "ana@example.com", iss: "link", aud: "link" });
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp! - payload.iat!).toBe(12 * 3600);
    expect(payload).not.toHaveProperty("pcr");
  });

  it("solo agrega pcr cuando el cambio de contraseña es obligatorio", () => {
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: true });

    expect((jwt.decode(token) as jwt.JwtPayload).pcr).toBe(true);
  });

  it("firma con SESSION_JWT_SECRET, con un proveedor externo activo o con cuentas locales", () => {
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });

    expect(() => jwt.verify(token, TEST_SESSION_JWT_SECRET)).not.toThrow();
    expect(() => jwt.verify(token, PROVIDER_JWT_SECRET)).toThrow(jwt.JsonWebTokenError);
  });
});

// El verificador es el mismo con cualquier proveedor: solo acepta la sesión de LINK.
describe.each([
  { label: "cuentas locales", local: true, expectedProvider: "local" },
  // El de src/test/setup.ts: no hace falta cambiarlo.
  { label: "proveedor externo", local: false, expectedProvider: "external-test" },
])("verifyAccessToken — $label", ({ local, expectedProvider }) => {
  if (local) useLocalAuth();

  function signSession(
    claims: Record<string, unknown>,
    options: jwt.SignOptions = {},
    secret: string = TEST_SESSION_JWT_SECRET,
  ) {
    return jwt.sign(claims, secret, {
      algorithm: "HS256",
      subject: "user-1",
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: 3600,
      ...options,
    });
  }

  it("un token de sesión válido da la identidad, con roles vacíos hasta resolver el usuario", () => {
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });

    const identity = verifyAccessToken(token);

    expect(identity).toMatchObject({
      mustChangePassword: false,
      user: { id: "user-1", email: "ana@example.com", roles: [], permissions: [], authProvider: expectedProvider },
    });
    expect(identity.iat).toEqual(expect.any(Number));
  });

  it("pcr llega como mustChangePassword", () => {
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: true });

    expect(verifyAccessToken(token).mustChangePassword).toBe(true);
  });

  it("rechaza un token vencido con TokenExpiredError", () => {
    const token = signSession({ email: "ana@example.com" }, { expiresIn: -10 });

    expect(() => verifyAccessToken(token)).toThrow(jwt.TokenExpiredError);
  });

  it("rechaza un token firmado con otro secreto", () => {
    const token = signSession({ email: "ana@example.com" }, {}, "otro-secreto-de-32-caracteres-o-mas!!");

    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it("rechaza un token con iss o aud incorrectos", () => {
    expect(() => verifyAccessToken(signSession({ email: "ana@example.com" }, { issuer: "otra-app" }))).toThrow(
      jwt.JsonWebTokenError,
    );
    expect(() => verifyAccessToken(signSession({ email: "ana@example.com" }, { audience: "otra-app" }))).toThrow(
      jwt.JsonWebTokenError,
    );
  });

  it("rechaza un token con alg: none", () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      encode({ alg: "none", typ: "JWT" }),
      encode({ sub: "user-1", email: "ana@example.com", iss: "link", aud: "link", iat: now, exp: now + 3600 }),
      "",
    ].join(".");

    expect(() => verifyAccessToken(unsigned)).toThrow(jwt.JsonWebTokenError);
  });

  it("rechaza un token sin sub o sin email", () => {
    expect(() =>
      verifyAccessToken(
        jwt.sign({ email: "ana@example.com" }, TEST_SESSION_JWT_SECRET, {
          algorithm: "HS256",
          issuer: SESSION_TOKEN_ISSUER,
          audience: SESSION_TOKEN_AUDIENCE,
          expiresIn: 3600,
        }),
      ),
    ).toThrow(jwt.JsonWebTokenError);
    expect(() => verifyAccessToken(signSession({}))).toThrow(jwt.JsonWebTokenError);
  });

  it("el token de un proveedor externo no autentica, firmado con su secreto o con el de sesión", () => {
    const withProviderSecret = jwt.sign(providerTokenPayload(), PROVIDER_JWT_SECRET, { algorithm: "HS256" });
    const withSessionSecret = jwt.sign(providerTokenPayload(), TEST_SESSION_JWT_SECRET, { algorithm: "HS256" });

    expect(() => verifyAccessToken(withProviderSecret)).toThrow(jwt.JsonWebTokenError);
    expect(() => verifyAccessToken(withSessionSecret)).toThrow(jwt.JsonWebTokenError);
  });

  it("rechaza un token de sesión firmado con el secreto de un proveedor", () => {
    const token = signSession({ email: "ana@example.com" }, {}, PROVIDER_JWT_SECRET);

    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });
});
