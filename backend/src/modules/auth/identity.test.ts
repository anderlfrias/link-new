import { User, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { LOCAL_AUTH_CONFIG, useAuthMode } from "../../test/auth-mode";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn(),
}));

import * as SettingsService from "../settings/settings.service";
import { findUserByEmail, findUserById } from "./auth.repository";
import { AuthenticatedIdentity } from "./auth.types";
import { assertNotPasswordChangeOnly, authenticateAccessToken, resolveInternalUser } from "./identity";
import { signLocalToken } from "./jwt";

const EXTERNAL_AUTH_JWT_SECRET = requireExternalUserConfig(env.auth).jwtSecret;

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
    localRoles: ["admin"],
    tokensValidAfter: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function localIdentity(overrides: Partial<AuthenticatedIdentity> = {}): AuthenticatedIdentity {
  return {
    mode: "local",
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
      authProvider: "local",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(findUserByEmail).mockReset();
  vi.mocked(findUserById).mockReset();
  vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as never);
});

describe("resolveInternalUser — modo external-auth", () => {
  const external-authIdentity: AuthenticatedIdentity = {
    mode: "external-auth",
    mustChangePassword: false,
    iat: nowSeconds(),
    user: {
      id: "ext-1",
      email: "ana@example.com",
      username: "ana",
      fullName: "Ana de EXTERNAL_AUTH",
      roles: ["admin"],
      permissions: ["READ"],
      app: "chat-interno",
      exp: nowSeconds() + 3600,
      authProvider: "external-auth",
    },
  };

  it("busca por email y suma el id interno, con los roles del JWT de EXTERNAL_AUTH (como siempre)", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(buildUser({ id: "internal-1", localRoles: [] }));

    const { user } = await resolveInternalUser(external-authIdentity);

    expect(findUserByEmail).toHaveBeenCalledWith("ana@example.com");
    expect(user).toEqual({ ...external-authIdentity.user, internalUserId: "internal-1" });
  });

  it("sin perfil local -> 401 User not found", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    await expect(resolveInternalUser(external-authIdentity)).rejects.toThrow(new UnauthorizedError("User not found"));
  });

  it("cuenta desactivada -> 401 account_disabled, aunque el token de EXTERNAL_AUTH sea válido (invariante 5)", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(buildUser({ status: UserStatus.INACTIVE }));

    await expect(resolveInternalUser(external-authIdentity)).rejects.toMatchObject({
      statusCode: 401,
      code: "account_disabled",
    });
  });

  it("no consulta la duración de sesión del modo local", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(buildUser());

    await resolveInternalUser({ ...external-authIdentity, iat: nowSeconds() - 30 * 24 * 3600 });

    expect(SettingsService.getSettings).not.toHaveBeenCalled();
  });
});

describe("resolveInternalUser — modo local", () => {
  it("busca por id y completa email, nombre, username y roles desde la base", async () => {
    vi.mocked(findUserById).mockResolvedValue(
      buildUser({ email: "ana.nueva@example.com", name: "Ana P.", username: "anap", localRoles: ["admin"] }),
    );

    const { user } = await resolveInternalUser(localIdentity());

    expect(findUserById).toHaveBeenCalledWith("user-1");
    expect(user).toMatchObject({
      id: "user-1",
      internalUserId: "user-1",
      email: "ana.nueva@example.com",
      fullName: "Ana P.",
      username: "anap",
      roles: ["admin"],
      authProvider: "local",
    });
  });

  it("cuenta desactivada -> 401 account_disabled", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser({ status: UserStatus.INACTIVE }));

    await expect(resolveInternalUser(localIdentity())).rejects.toMatchObject({ code: "account_disabled" });
  });

  it("revocación al segundo: un token del mismo segundo que tokensValidAfter vale, uno anterior no (invariante 3)", async () => {
    const cut = new Date();
    cut.setMilliseconds(0);
    vi.mocked(findUserById).mockResolvedValue(buildUser({ tokensValidAfter: cut }));
    const cutSeconds = cut.getTime() / 1000;

    await expect(resolveInternalUser(localIdentity({ iat: cutSeconds }))).resolves.toBeDefined();
    await expect(resolveInternalUser(localIdentity({ iat: cutSeconds - 1 }))).rejects.toMatchObject({
      statusCode: 401,
      code: "token_revoked",
    });
  });

  it("un token más viejo que la duración vigente se rechaza; bajar la duración corta los ya emitidos (invariante 4)", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const fiveHoursAgo = localIdentity({ iat: nowSeconds() - 5 * 3600 });

    vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as never);
    await expect(resolveInternalUser(fiveHoursAgo)).resolves.toBeDefined();

    vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 4 } as never);
    await expect(resolveInternalUser(fiveHoursAgo)).rejects.toMatchObject({ code: "session_expired" });
  });

  it("sin iat falla cerrado", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());

    await expect(resolveInternalUser(localIdentity({ iat: undefined }))).rejects.toThrow(UnauthorizedError);
  });
});

describe("assertNotPasswordChangeOnly", () => {
  it("un token restringido (pcr) -> 403 password_change_required, nunca 401", () => {
    expect(() => assertNotPasswordChangeOnly(localIdentity({ mustChangePassword: true }))).toThrow(ForbiddenError);
    try {
      assertNotPasswordChangeOnly(localIdentity({ mustChangePassword: true }));
    } catch (error) {
      expect((error as ForbiddenError).code).toBe("password_change_required");
    }
  });

  it("un token normal pasa", () => {
    expect(() => assertNotPasswordChangeOnly(localIdentity())).not.toThrow();
  });
});

describe("authenticateAccessToken", () => {
  describe("en modo local", () => {
    useAuthMode(LOCAL_AUTH_CONFIG);

    it("acepta un token local y lo resuelve", async () => {
      vi.mocked(findUserById).mockResolvedValue(buildUser());
      const token = signLocalToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });

      const { user } = await authenticateAccessToken(token);

      expect(user.internalUserId).toBe("user-1");
      expect(user.roles).toEqual(["admin"]);
    });

    it("rechaza un token restringido (pcr): solo sirve para cambiar la contraseña (invariante 8)", async () => {
      vi.mocked(findUserById).mockResolvedValue(buildUser());
      const token = signLocalToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: true });

      await expect(authenticateAccessToken(token)).rejects.toMatchObject({ code: "password_change_required" });
      expect(findUserById).not.toHaveBeenCalled();
    });

    it("rechaza un token de EXTERNAL_AUTH (invariante 1)", async () => {
      const external-authToken = jwt.sign(
        { id: "ext-1", email: "ana@example.com", username: "ana", name: "Ana", roles: [], app: "x" },
        EXTERNAL_AUTH_JWT_SECRET,
        { algorithm: "HS256", expiresIn: 3600 },
      );

      await expect(authenticateAccessToken(external-authToken)).rejects.toBeInstanceOf(jwt.JsonWebTokenError);
    });
  });

  describe("en modo external-auth", () => {
    it("rechaza un token local (invariante 1)", async () => {
      const original = env.auth;
      env.auth = LOCAL_AUTH_CONFIG;
      const localToken = signLocalToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });
      env.auth = original;

      await expect(authenticateAccessToken(localToken)).rejects.toBeInstanceOf(jwt.JsonWebTokenError);
      expect(findUserByEmail).not.toHaveBeenCalled();
    });
  });
});
