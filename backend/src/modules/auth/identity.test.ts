import { User, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalAuth } from "../../test/auth-mode";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findUserById: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn(),
}));

import * as SettingsService from "../settings/settings.service";
import { findUserById } from "./auth.repository";
import { AuthenticatedIdentity } from "./auth.types";
import { assertNotPasswordChangeOnly, authenticateAccessToken, resolveInternalUser } from "./identity";
import { signSessionToken } from "./jwt";

// El secreto con el que un proveedor externo firma su propio token: no es el de sesión de LINK.
const PROVIDER_JWT_SECRET = "provider-own-secret";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    externalId: null,
    identityProvider: null,
    username: "ana.perez",
    name: "Ana Pérez",
    email: "ana@example.com",
    avatarFileId: null,
    syncProfileWithIntegration: true,
    status: UserStatus.ACTIVE,
    notificationSoundEnabled: true,
    language: "es",
    roles: ["admin"],
    tokensValidAfter: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sessionIdentity(
  overrides: Partial<AuthenticatedIdentity> = {},
  authProvider = "local",
): AuthenticatedIdentity {
  return {
    mustChangePassword: false,
    iat: nowSeconds(),
    user: {
      id: "user-1",
      email: "ana@example.com",
      username: null,
      fullName: "",
      roles: [],
      permissions: [],
      app: "link",
      exp: nowSeconds() + 3600,
      authProvider,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(findUserById).mockReset();
  vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as never);
});

// La resolución es una sola, sin ramas por modo: la sesión es siempre la de LINK.
describe.each([
  { label: "cuentas locales", authProvider: "local" as const },
  { label: "proveedor externo", authProvider: "external-test" as const },
])("resolveInternalUser — $label", ({ authProvider }) => {
  const identity = (overrides: Partial<AuthenticatedIdentity> = {}) => sessionIdentity(overrides, authProvider);

  it("busca por id y completa email, nombre, username y roles desde la base", async () => {
    vi.mocked(findUserById).mockResolvedValue(
      buildUser({ email: "ana.nueva@example.com", name: "Ana P.", username: "anap", roles: ["admin"] }),
    );

    const { user } = await resolveInternalUser(identity());

    expect(findUserById).toHaveBeenCalledWith("user-1");
    expect(user).toMatchObject({
      id: "user-1",
      internalUserId: "user-1",
      email: "ana.nueva@example.com",
      fullName: "Ana P.",
      username: "anap",
      roles: ["admin"],
      authProvider,
    });
  });

  it("los roles salen de la base, no del token", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser({ roles: [] }));

    const { user } = await resolveInternalUser(
      identity({ user: { ...identity().user, roles: ["admin"] } }),
    );

    expect(user.roles).toEqual([]);
  });

  it("sin cuenta -> 401 User not found", async () => {
    vi.mocked(findUserById).mockResolvedValue(null);

    await expect(resolveInternalUser(identity())).rejects.toThrow(new UnauthorizedError("User not found"));
  });

  it("cuenta desactivada -> 401 account_disabled", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser({ status: UserStatus.INACTIVE }));

    await expect(resolveInternalUser(identity())).rejects.toMatchObject({ code: "account_disabled" });
  });

  it("revocación al segundo: un token del mismo segundo que tokensValidAfter vale, uno anterior no (invariante 3)", async () => {
    const cut = new Date();
    cut.setMilliseconds(0);
    vi.mocked(findUserById).mockResolvedValue(buildUser({ tokensValidAfter: cut }));
    const cutSeconds = cut.getTime() / 1000;

    await expect(resolveInternalUser(identity({ iat: cutSeconds }))).resolves.toBeDefined();
    await expect(resolveInternalUser(identity({ iat: cutSeconds - 1 }))).rejects.toMatchObject({
      statusCode: 401,
      code: "token_revoked",
    });
  });

  it("un token más viejo que la duración vigente se rechaza; bajar la duración corta los ya emitidos (invariante 4)", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const fiveHoursAgo = identity({ iat: nowSeconds() - 5 * 3600 });

    vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as never);
    await expect(resolveInternalUser(fiveHoursAgo)).resolves.toBeDefined();

    vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 4 } as never);
    await expect(resolveInternalUser(fiveHoursAgo)).rejects.toMatchObject({ code: "session_expired" });
  });

  it("sin iat falla cerrado", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());

    await expect(resolveInternalUser(identity({ iat: undefined }))).rejects.toThrow(UnauthorizedError);
  });
});

describe("assertNotPasswordChangeOnly", () => {
  it("un token restringido (pcr) -> 403 password_change_required, nunca 401", () => {
    expect(() => assertNotPasswordChangeOnly(sessionIdentity({ mustChangePassword: true }))).toThrow(ForbiddenError);
    try {
      assertNotPasswordChangeOnly(sessionIdentity({ mustChangePassword: true }));
    } catch (error) {
      expect((error as ForbiddenError).code).toBe("password_change_required");
    }
  });

  it("un token normal pasa", () => {
    expect(() => assertNotPasswordChangeOnly(sessionIdentity())).not.toThrow();
  });
});

describe.each([
  { label: "cuentas locales", local: true },
  // El de src/test/setup.ts: no hace falta cambiarlo.
  { label: "proveedor externo", local: false },
])("authenticateAccessToken — $label", ({ local }) => {
  if (local) useLocalAuth();

  it("acepta la sesión de LINK y la resuelve", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });

    const { user } = await authenticateAccessToken(token);

    expect(user.internalUserId).toBe("user-1");
    expect(user.roles).toEqual(["admin"]);
  });

  it("rechaza un token restringido (pcr): solo sirve para cambiar la contraseña (invariante 8)", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: true });

    await expect(authenticateAccessToken(token)).rejects.toMatchObject({ code: "password_change_required" });
    expect(findUserById).not.toHaveBeenCalled();
  });

  it("rechaza el token de un proveedor externo: no autentica en ningún lado (invariante 1)", async () => {
    const providerToken = jwt.sign(
      { id: "ext-1", email: "ana@example.com", username: "ana", name: "Ana", roles: [], app: "x" },
      PROVIDER_JWT_SECRET,
      { algorithm: "HS256", expiresIn: 3600 },
    );

    await expect(authenticateAccessToken(providerToken)).rejects.toBeInstanceOf(jwt.JsonWebTokenError);
    expect(findUserById).not.toHaveBeenCalled();
  });
});
