import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MappedUser } from "../modules/auth/auth.types";
import { UnauthorizedError } from "../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";

vi.mock("../config/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

// Import posterior al mock, como pide vitest para que el mock ya esté armado.
import { prisma } from "../config/prisma";
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
    ...overrides,
  };
}

describe("attachInternalUser", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it("sin req.user (authenticate no corrió antes) -> UnauthorizedError, no consulta la DB", async () => {
    const req = createMockRequest();
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
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
  });

  it("usuario encontrado -> agrega internalUserId a req.user y llama next() sin argumentos", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "internal-uuid-1" } as never);
    const req = createMockRequest({ user: buildMappedUser() });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(req.user?.internalUserId).toBe("internal-uuid-1");
    expect(next).toHaveBeenCalledWith();
  });

  it("la DB tira un error -> se propaga tal cual a next(), no se swallowea", async () => {
    const dbError = new Error("connection lost");
    vi.mocked(prisma.user.findUnique).mockRejectedValue(dbError);
    const req = createMockRequest({ user: buildMappedUser() });
    const next = createMockNext();

    await attachInternalUser(req, createMockResponse(), next);

    expect(next).toHaveBeenCalledWith(dbError);
  });
});
