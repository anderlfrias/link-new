import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import { mapTokenToUser, signLocalToken } from "../modules/auth/jwt";
import env from "../config/env";
import { LOCAL_AUTH_CONFIG, useAuthMode } from "../test/auth-mode";
import type { MappedUser, ExternalUserTokenPayload } from "../modules/auth/auth.types";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { authenticate, authenticateForPasswordChange, requireRoles } from "./auth.middleware";

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
      authProvider: "external-auth",
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

function signLocal(mustChangePassword = false): string {
  const original = env.auth;
  env.auth = LOCAL_AUTH_CONFIG;
  try {
    return signLocalToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword });
  } finally {
    env.auth = original;
  }
}

function run(middleware: typeof authenticate, token: string) {
  const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
  const next = createMockNext();
  middleware(req, createMockResponse(), next);
  return { req, error: next.mock.calls[0][0] };
}

describe("authenticate — según el modo (LOCAL_AUTH_PLAN.md, Fase 4)", () => {
  describe("modo external-auth", () => {
    it("un token local -> 401 Invalid token (invariante 1)", () => {
      const { error } = run(authenticate, signLocal());

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe("Invalid token");
    });

    it("guarda la identidad verificada para attachInternalUser", () => {
      const token = jwt.sign(buildPayload(), JWT_SECRET, { algorithm: "HS256" });

      const { req, error } = run(authenticate, token);

      expect(error).toBeUndefined();
      expect(req.authIdentity).toMatchObject({ mode: "external-auth", mustChangePassword: false });
    });
  });

  describe("modo local", () => {
    useAuthMode(LOCAL_AUTH_CONFIG);

    it("acepta un token local, con roles vacíos hasta que attachInternalUser los lea de la base", () => {
      const { req, error } = run(authenticate, signLocal());

      expect(error).toBeUndefined();
      expect(req.user).toMatchObject({ id: "user-1", email: "ana@example.com", roles: [], authProvider: "local" });
      expect(req.authIdentity?.iat).toEqual(expect.any(Number));
    });

    it("un token de EXTERNAL_AUTH -> 401 Invalid token (invariante 1)", () => {
      const external-authToken = jwt.sign(buildPayload(), JWT_SECRET, { algorithm: "HS256" });

      const { error } = run(authenticate, external-authToken);

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe("Invalid token");
    });

    it("un token restringido (pcr) -> 403 password_change_required, no 401 (invariante 8)", () => {
      const { req, error } = run(authenticate, signLocal(true));

      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.code).toBe("password_change_required");
      expect(req.user).toBeUndefined();
    });

    it("authenticateForPasswordChange sí acepta el token restringido", () => {
      const { req, error } = run(authenticateForPasswordChange, signLocal(true));

      expect(error).toBeUndefined();
      expect(req.authIdentity?.mustChangePassword).toBe(true);
    });

    it("requireRoles montado sin attachInternalUser falla cerrado aunque la cuenta sea admin (D7)", () => {
      const { req } = run(authenticate, signLocal());
      const next = createMockNext();

      requireRoles("admin")(req, createMockResponse(), next);

      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    });
  });
});
