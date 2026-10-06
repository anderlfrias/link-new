import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MappedUser } from "../modules/auth/auth.types";
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

describe("attachInternalUser", () => {
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

  it("email del JWT no tiene perfil local todavía -> UnauthorizedError 'User not found'", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const req = createMockRequest({ user: buildMappedUser({ email: "nuevo@example.com" }) });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "nuevo@example.com" } });
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("User not found");
    expect(bindContext).not.toHaveBeenCalled();
  });

  it("usuario encontrado -> agrega internalUserId a req.user y llama next() sin argumentos", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "internal-uuid-1",
      email: "user@example.com",
      status: "ACTIVE",
    } as never);
    const req = createMockRequest({ user: buildMappedUser() });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(req.user?.internalUserId).toBe("internal-uuid-1");
    expect(next).toHaveBeenCalledWith();
  });

  it("usuario encontrado -> llama a bindContext con el userId interno y la identidad del actor", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "internal-uuid-1",
      email: "user@example.com",
      status: "ACTIVE",
    } as never);
    const req = createMockRequest({ user: buildMappedUser() });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(bindContext).toHaveBeenCalledWith({
      logFields: { userId: "internal-uuid-1" },
      meta: { actorUserId: "internal-uuid-1", actorEmail: "user@example.com" },
    });
  });

  it("la DB tira un error -> se propaga tal cual a next(), no se swallowea", async () => {
    const dbError = new Error("connection lost");
    vi.mocked(prisma.user.findUnique).mockRejectedValue(dbError);
    const req = createMockRequest({ user: buildMappedUser() });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(bindContext).not.toHaveBeenCalled();
  });

  it("modo external-auth: cuenta desactivada -> 401 account_disabled, sin bindContext (invariante 5)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "internal-uuid-1",
      email: "user@example.com",
      status: "INACTIVE",
    } as never);
    const req = createMockRequest({ user: buildMappedUser() });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.code).toBe("account_disabled");
    expect(bindContext).not.toHaveBeenCalled();
  });

  describe("modo local", () => {
    useAuthMode(LOCAL_AUTH_CONFIG);

    it("busca por id y deja en req.user los datos y roles de la base", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "ana@example.com",
        name: "Ana Gómez",
        username: null,
        status: "ACTIVE",
        localRoles: ["admin"],
        tokensValidAfter: null,
      } as never);
      const user = buildMappedUser({ id: "user-1", email: "ana@example.com", roles: [], authProvider: "local" });
      const req = createMockRequest({ user });
      req.authIdentity = { mode: "local", user, mustChangePassword: false, iat: Math.floor(Date.now() / 1000) };
      const next = createMockNext();

      await attachInternalUser(req, createMockResponse(), next);

      expect(next).toHaveBeenCalledWith();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(req.user).toMatchObject({ internalUserId: "user-1", roles: ["admin"], fullName: "Ana Gómez" });
    });

    it("sin la identidad que deja authenticate (sin iat) falla cerrado", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "ana@example.com",
        status: "ACTIVE",
        localRoles: ["admin"],
      } as never);
      const req = createMockRequest({ user: buildMappedUser({ id: "user-1", authProvider: "local" }) });
      const next = createMockNext();

      await attachInternalUser(req, createMockResponse(), next);

      expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    });
  });
});
