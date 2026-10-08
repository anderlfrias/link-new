import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { ServiceUnavailableError } from "../../utils/errors";
import { ExternalUserTokenPayload } from "./auth.types";
import { LOCAL_AUTH_CONFIG, TEST_SESSION_JWT_SECRET, useAuthMode } from "../../test/auth-mode";
import {
  buildFullName,
  SESSION_TOKEN_AUDIENCE,
  SESSION_TOKEN_ISSUER,
  mapTokenToUser,
  signSessionToken,
  verifyAccessToken,
  verifyToken,
} from "./jwt";

// vitest.config.ts define las tres EXTERNAL_AUTH_*, así que estos tests corren en modo external-auth.
const EXTERNAL_AUTH_JWT_SECRET = requireExternalUserConfig(env.auth).jwtSecret;

function createValidPayload(overrides: Partial<ExternalUserTokenPayload> = {}): ExternalUserTokenPayload {
  return {
    id: "ext-user-1",
    email: "test@example.com",
    username: "testuser",
    name: "Juan",
    firstSurname: "Pérez",
    secondSurname: "García",
    roles: [
      {
        role: "admin",
        restrictions: [{ code: "READ_ALL" }, { code: "WRITE_ALL" }],
      },
      {
        role: "moderator",
      },
    ],
    app: "chat-interno",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe("jwt module", () => {
  describe("buildFullName", () => {
    it("concatena nombre, primer apellido y segundo apellido", () => {
      const result = buildFullName({
        name: "Juan",
        firstSurname: "Pérez",
        secondSurname: "García",
      });
      expect(result).toBe("Juan Pérez García");
    });

    it("concatena solo nombre y primer apellido si segundo apellido está ausente", () => {
      const result = buildFullName({
        name: "María",
        firstSurname: "López",
      });
      expect(result).toBe("María López");
    });

    it("devuelve solo el nombre si no hay apellidos", () => {
      const result = buildFullName({
        name: "Carlos",
      });
      expect(result).toBe("Carlos");
    });

    it("devuelve solo apellidos si no hay nombre", () => {
      const result = buildFullName({
        firstSurname: "Rodríguez",
        secondSurname: "Santos",
      });
      expect(result).toBe("Rodríguez Santos");
    });

    it("devuelve string vacío si todos los campos son undefined o vacíos", () => {
      expect(buildFullName({})).toBe("");
      expect(buildFullName({ name: "", firstSurname: undefined, secondSurname: "" })).toBe("");
    });
  });

  describe("mapTokenToUser", () => {
    it("mapea correctamente el payload a MappedUser", () => {
      const payload = createValidPayload();
      const mapped = mapTokenToUser(payload);

      expect(mapped).toEqual({
        id: "ext-user-1",
        email: "test@example.com",
        username: "testuser",
        fullName: "Juan Pérez García",
        roles: ["admin", "moderator"],
        permissions: ["READ_ALL", "WRITE_ALL"],
        app: "chat-interno",
        exp: payload.exp,
        authProvider: "external-auth",
      });
    });

    it("maneja roles sin restrictions asignando array vacío de permissions", () => {
      const payload = createValidPayload({
        roles: [{ role: "user" }],
      });
      const mapped = mapTokenToUser(payload);

      expect(mapped.roles).toEqual(["user"]);
      expect(mapped.permissions).toEqual([]);
    });
  });

  describe("verifyToken (el JWT que EXTERNAL_AUTH devuelve en el login)", () => {
    it("decodifica y valida un token firmado con el secret correcto", () => {
      const payload = createValidPayload();
      const token = jwt.sign(payload, EXTERNAL_AUTH_JWT_SECRET, { algorithm: "HS256" });

      const decoded = verifyToken(token);

      expect(decoded.id).toBe(payload.id);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.roles).toHaveLength(2);
    });

    it("lanza error si el token fue firmado con otro secret", () => {
      const payload = createValidPayload();
      const invalidToken = jwt.sign(payload, "wrong-secret", { algorithm: "HS256" });

      expect(() => verifyToken(invalidToken)).toThrow(jwt.JsonWebTokenError);
    });

    it("lanza TokenExpiredError si el token ya expiró", () => {
      const expiredPayload = createValidPayload({
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      const token = jwt.sign(expiredPayload, EXTERNAL_AUTH_JWT_SECRET, { algorithm: "HS256" });

      expect(() => verifyToken(token)).toThrow(jwt.TokenExpiredError);
    });

    it("lanza error si el token es inválido o corrupto", () => {
      expect(() => verifyToken("not-a-valid-token")).toThrow(jwt.JsonWebTokenError);
    });

    it("en modo local rechaza un token de EXTERNAL_AUTH aunque esté firmado con el secreto que EXTERNAL_AUTH usaba", () => {
      const token = jwt.sign(createValidPayload(), EXTERNAL_AUTH_JWT_SECRET, { algorithm: "HS256" });
      const originalAuth = env.auth;
      env.auth = { mode: "local", sessionSecret: "l".repeat(32) };

      try {
        expect(() => verifyToken(token)).toThrow(ServiceUnavailableError);
      } finally {
        env.auth = originalAuth;
      }
    });
  });

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

    it("firma con SESSION_JWT_SECRET en los dos modos, también cuando el login lo valida EXTERNAL_AUTH", () => {
      const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });

      // En modo external-auth (el de vitest.config.ts) el token verifica con el secreto de sesión...
      expect(() => jwt.verify(token, TEST_SESSION_JWT_SECRET)).not.toThrow();
      // ...y no con el de EXTERNAL_AUTH.
      expect(() => jwt.verify(token, EXTERNAL_AUTH_JWT_SECRET)).toThrow(jwt.JsonWebTokenError);
    });
  });

  // El verificador es el mismo en los dos modos: solo acepta la sesión de LINK.
  describe.each([
    { label: "modo local", config: LOCAL_AUTH_CONFIG, expectedProvider: "local" },
    // El modo de vitest.config.ts: no hace falta cambiarlo.
    { label: "modo external-auth", config: undefined, expectedProvider: "external-auth" },
  ])("verifyAccessToken — $label", ({ config, expectedProvider }) => {
    if (config) useAuthMode(config);

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
      expect(() => verifyAccessToken(jwt.sign({ email: "ana@example.com" }, TEST_SESSION_JWT_SECRET, {
        algorithm: "HS256",
        issuer: SESSION_TOKEN_ISSUER,
        audience: SESSION_TOKEN_AUDIENCE,
        expiresIn: 3600,
      }))).toThrow(jwt.JsonWebTokenError);
      expect(() => verifyAccessToken(signSession({}))).toThrow(jwt.JsonWebTokenError);
    });

    it("el JWT de EXTERNAL_AUTH directo ya no autentica, firmado con el secreto de EXTERNAL_AUTH o con el de sesión", () => {
      const withProviderSecret = jwt.sign(createValidPayload(), EXTERNAL_AUTH_JWT_SECRET, { algorithm: "HS256" });
      const withSessionSecret = jwt.sign(createValidPayload(), TEST_SESSION_JWT_SECRET, { algorithm: "HS256" });

      expect(() => verifyAccessToken(withProviderSecret)).toThrow(jwt.JsonWebTokenError);
      expect(() => verifyAccessToken(withSessionSecret)).toThrow(jwt.JsonWebTokenError);
    });

    it("rechaza un token de sesión firmado con el secreto de EXTERNAL_AUTH", () => {
      const token = signSession({ email: "ana@example.com" }, {}, EXTERNAL_AUTH_JWT_SECRET);

      expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
    });
  });
});
