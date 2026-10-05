import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { ServiceUnavailableError } from "../../utils/errors";
import { ExternalUserTokenPayload } from "./auth.types";
import { buildFullName, mapTokenToUser, verifyToken } from "./jwt";

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

  describe("verifyToken", () => {
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
      env.auth = { mode: "local", local: { jwtSecret: "l".repeat(32) } };

      try {
        expect(() => verifyToken(token)).toThrow(ServiceUnavailableError);
      } finally {
        env.auth = originalAuth;
      }
    });
  });
});
