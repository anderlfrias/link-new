import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import { mapTokenToUser } from "../modules/auth/jwt";
import type { MappedUser, ExternalUserTokenPayload } from "../modules/auth/auth.types";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { authenticate, requireRoles } from "./auth.middleware";

// Mismo secret que EXTERNAL_AUTH_JWT_SECRET en vitest.config.ts.
const JWT_SECRET = "test-jwt-secret";

function buildPayload(overrides: Partial<ExternalUserTokenPayload> = {}): ExternalUserTokenPayload {
  return {
    id: "ext-1",
    email: "user@example.com",
    username: "user1",
    name: "Ana",
    firstSurname: "Gómez",
    roles: [{ role: "admin" }],
    app: "chat-interno",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function signToken(payload: ExternalUserTokenPayload): string {
  // El payload ya trae `exp` propio — no pasar `expiresIn` acá, jsonwebtoken
  // tira si vienen los dos a la vez.
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256" });
}

describe("authenticate", () => {
  it("sin header Authorization -> UnauthorizedError 'Missing token'", () => {
    const req = createMockRequest();
    const next = createMockNext();

    authenticate(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Missing token");
  });

  it("header sin prefijo 'Bearer ' -> UnauthorizedError 'Missing token'", () => {
    const req = createMockRequest({ headers: { authorization: "Token abc123" } });
    const next = createMockNext();

    authenticate(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Missing token");
  });

  it("token con formato inválido -> UnauthorizedError 'Invalid token'", () => {
    const req = createMockRequest({ headers: { authorization: "Bearer no-es-un-jwt" } });
    const next = createMockNext();

    authenticate(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Invalid token");
  });

  it("token firmado con otro secret -> UnauthorizedError 'Invalid token'", () => {
    const token = jwt.sign(buildPayload(), "otro-secret-distinto", { algorithm: "HS256" });
    const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const next = createMockNext();

    authenticate(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Invalid token");
  });

  it("token vencido -> UnauthorizedError 'Token expired' (branch dedicado, no el genérico)", () => {
    const expiredPayload = buildPayload({ exp: Math.floor(Date.now() / 1000) - 10 });
    const token = signToken(expiredPayload);
    const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const next = createMockNext();

    authenticate(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Token expired");
  });

  it("token válido -> req.user = mapTokenToUser(payload) y next() sin argumentos", () => {
    const payload = buildPayload();
    const token = signToken(payload);
    const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const next = createMockNext();

    authenticate(req, createMockResponse(), next);

    expect(req.user).toEqual(mapTokenToUser(payload));
    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireRoles", () => {
  function buildMappedUser(overrides: Partial<MappedUser> = {}): MappedUser {
    return {
      id: "ext-1",
      email: "user@example.com",
      username: "user1",
      fullName: "Ana Gómez",
      roles: [],
      permissions: [],
      app: "chat-interno",
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    };
  }

  let next: ReturnType<typeof createMockNext>;

  beforeEach(() => {
    next = createMockNext();
  });

  it("sin req.user -> ForbiddenError 'Insufficient role'", () => {
    const req = createMockRequest();

    requireRoles("admin")(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe("Insufficient role");
  });

  it("req.user sin ninguno de los roles pedidos -> ForbiddenError", () => {
    const req = createMockRequest({ user: buildMappedUser({ roles: ["member"] }) });

    requireRoles("admin", "owner")(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it("req.user con al menos uno de los roles pedidos -> next() sin argumentos", () => {
    const req = createMockRequest({ user: buildMappedUser({ roles: ["member", "admin"] }) });

    requireRoles("admin", "owner")(req, createMockResponse(), next);

    expect(next).toHaveBeenCalledWith();
  });
});
