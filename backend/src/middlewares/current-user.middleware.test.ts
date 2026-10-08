import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedIdentity, MappedUser } from "../modules/auth/auth.types";
import { UnauthorizedError } from "../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { LOCAL_AUTH_CONFIG, useAuthMode } from "../test/auth-mode";

vi.mock("../config/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("../modules/settings/settings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({ localSessionTtlHours: 12 }),
}));

vi.mock("../config/request-context", () => ({
  bindContext: vi.fn(),
}));

// Import posterior al mock, como pide vitest para que el mock ya esté armado.
import { prisma } from "../config/prisma";
import { bindContext } from "../config/request-context";
import { attachInternalUser } from "./current-user.middleware";

function buildMappedUser(overrides: Partial<MappedUser> = {}): MappedUser {
  return {
    id: "user-1",
    email: "user@example.com",
    username: null,
    fullName: "",
    roles: [],
    permissions: [],
    app: "link",
    exp: Math.floor(Date.now() / 1000) + 3600,
    authProvider: "external-auth",
    ...overrides,
  };
}

/// Lo que deja `authenticate` en la request: el usuario y la identidad verificada.
function buildRequest(user: MappedUser = buildMappedUser(), identity: Partial<AuthenticatedIdentity> = {}) {
  const req = createMockRequest({ user });
  req.authIdentity = { user, mustChangePassword: false, iat: Math.floor(Date.now() / 1000), ...identity };
  return req;
}

function activeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "Ana Gómez",
    username: null,
    status: "ACTIVE",
    roles: [],
    tokensValidAfter: null,
    ...overrides,
  } as never;
}

describe.each([
  { label: "modo external-auth", config: undefined, authProvider: "external-auth" as const },
  { label: "modo local", config: LOCAL_AUTH_CONFIG, authProvider: "local" as const },
])("attachInternalUser — $label", ({ config, authProvider }) => {
  if (config) useAuthMode(config);

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(bindContext).mockReset();
  });

  it("sin req.user (authenticate no corrió antes) -> UnauthorizedError, no consulta la DB", async () => {
    const req = createMockRequest();
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bindContext).not.toHaveBeenCalled();
  });

  it("sin authIdentity (la request no pasó por authenticate) falla cerrado, aunque haya req.user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount({ roles: ["admin"] }));
    const req = createMockRequest({ user: buildMappedUser({ authProvider }) });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("sin iat en la identidad falla cerrado", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount());
    const req = buildRequest(buildMappedUser({ authProvider }), { iat: undefined });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("el id de la sesión no tiene cuenta -> UnauthorizedError 'User not found'", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const req = buildRequest(buildMappedUser({ id: "fantasma", authProvider }));
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "fantasma" } });
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("User not found");
    expect(bindContext).not.toHaveBeenCalled();
  });

  it("cuenta encontrada -> busca por id, deja en req.user los datos y roles de la base y llama next()", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      activeAccount({ email: "ana@example.com", name: "Ana Gómez", roles: ["admin"] }),
    );
    const req = buildRequest(buildMappedUser({ authProvider }));
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next).toHaveBeenCalledWith();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(req.user).toMatchObject({
      internalUserId: "user-1",
      email: "ana@example.com",
      fullName: "Ana Gómez",
      roles: ["admin"],
    });
  });

  it("cuenta encontrada -> llama a bindContext con el userId interno y la identidad del actor", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount());
    const req = buildRequest(buildMappedUser({ authProvider }));
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(bindContext).toHaveBeenCalledWith({
      logFields: { userId: "user-1" },
      meta: { actorUserId: "user-1", actorEmail: "user@example.com" },
    });
  });

  it("la DB tira un error -> se propaga tal cual a next(), no se swallowea", async () => {
    const dbError = new Error("connection lost");
    vi.mocked(prisma.user.findUnique).mockRejectedValue(dbError);
    const req = buildRequest(buildMappedUser({ authProvider }));
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(bindContext).not.toHaveBeenCalled();
  });

  it("cuenta desactivada -> 401 account_disabled, sin bindContext (invariante 5)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount({ status: "INACTIVE" }));
    const req = buildRequest(buildMappedUser({ authProvider }));
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.code).toBe("account_disabled");
    expect(bindContext).not.toHaveBeenCalled();
  });

  it("sesión emitida antes de tokensValidAfter -> 401 token_revoked", async () => {
    const iat = Math.floor(Date.now() / 1000);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      activeAccount({ tokensValidAfter: new Date((iat + 60) * 1000) }),
    );
    const req = buildRequest(buildMappedUser({ authProvider }), { iat });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next.mock.calls[0][0]).toMatchObject({ code: "token_revoked" });
  });
});
