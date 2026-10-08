import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import { signSessionToken } from "../modules/auth/jwt";
import { LOCAL_AUTH_CONFIG, TEST_SESSION_JWT_SECRET, useAuthMode } from "../test/auth-mode";
import type { MappedUser, ExternalUserTokenPayload } from "../modules/auth/auth.types";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { authenticate, authenticateForPasswordChange, requireRoles } from "./auth.middleware";

// Mismo secret que EXTERNAL_AUTH_JWT_SECRET en vitest.config.ts.
const EXTERNAL_AUTH_JWT_SECRET = "test-jwt-secret";

function buildExternalUserPayload(overrides: Partial<ExternalUserTokenPayload> = {}): ExternalUserTokenPayload {
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

function signSession(mustChangePassword = false): string {
  return signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword });
}

function run(middleware: typeof authenticate, token: string) {
  const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
  const next = createMockNext();
  middleware(req, createMockResponse(), next);
  return { req, error: next.mock.calls[0][0] };
}

// `authenticate` verifica con el mismo verificador en los dos modos: solo la sesión de LINK.
describe.each([
  { label: "modo external-auth", config: undefined, authProvider: "external-auth" },
  { label: "modo local", config: LOCAL_AUTH_CONFIG, authProvider: "local" },
])("authenticate — $label", ({ config, authProvider }) => {
  if (config) useAuthMode(config);

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
    const { error } = run(authenticate, "no-es-un-jwt");

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Invalid token");
  });

  it("token firmado con otro secret -> UnauthorizedError 'Invalid token'", () => {
    const token = jwt.sign({ email: "ana@example.com" }, "otro-secret-distinto-de-32-caracteres!!", {
      algorithm: "HS256",
      subject: "user-1",
      issuer: "link",
      audience: "link",
      expiresIn: 3600,
    });

    const { error } = run(authenticate, token);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Invalid token");
  });

  it("token vencido -> UnauthorizedError 'Token expired' (branch dedicado, no el genérico)", () => {
    const token = jwt.sign({ email: "ana@example.com" }, TEST_SESSION_JWT_SECRET, {
      algorithm: "HS256",
      subject: "user-1",
      issuer: "link",
      audience: "link",
      expiresIn: -10,
    });

    const { error } = run(authenticate, token);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Token expired");
  });

  it("el JWT de EXTERNAL_AUTH -> 401 Invalid token: ya no autentica, ni firmado con el secreto de EXTERNAL_AUTH ni con el de sesión (invariante 1)", () => {
    for (const secret of [EXTERNAL_AUTH_JWT_SECRET, TEST_SESSION_JWT_SECRET]) {
      const token = jwt.sign(buildExternalUserPayload(), secret, { algorithm: "HS256" });

      const { error } = run(authenticate, token);

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe("Invalid token");
    }
  });

  it("acepta la sesión de LINK, con roles vacíos hasta que attachInternalUser los lea de la base", () => {
    const { req, error } = run(authenticate, signSession());

    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({ id: "user-1", email: "ana@example.com", roles: [], authProvider });
    expect(req.authIdentity).toMatchObject({ mustChangePassword: false, iat: expect.any(Number) });
  });

  it("un token restringido (pcr) -> 403 password_change_required, no 401 (invariante 8)", () => {
    const { req, error } = run(authenticate, signSession(true));

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.code).toBe("password_change_required");
    expect(req.user).toBeUndefined();
  });

  it("authenticateForPasswordChange sí acepta el token restringido", () => {
    const { req, error } = run(authenticateForPasswordChange, signSession(true));

    expect(error).toBeUndefined();
    expect(req.authIdentity?.mustChangePassword).toBe(true);
  });

  it("requireRoles montado sin attachInternalUser falla cerrado aunque la cuenta sea admin (D7)", () => {
    const { req } = run(authenticate, signSession());
    const next = createMockNext();

    requireRoles("admin")(req, createMockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
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
