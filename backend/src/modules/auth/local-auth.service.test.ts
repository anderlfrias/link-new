import { LocalCredential, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION_JWT_SECRET, useExternalProvider, useLocalAuth } from "../../test/auth-mode";
import { BadRequestError } from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findLoginCandidates: vi.fn(),
  findUserWithCredential: vi.fn(),
  registerFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
  savePasswordChange: vi.fn(),
  updatePasswordHash: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getLocalAuthPolicy: vi.fn(),
}));

vi.mock("../audit/audit.service", () => ({
  record: vi.fn(),
}));

vi.mock("../../socket", () => ({
  getIO: vi.fn(() => ({ in: vi.fn() })),
  isSocketReady: vi.fn(() => true),
}));

vi.mock("../../socket/rooms", () => ({
  disconnectUserSockets: vi.fn(),
}));

// verifyPassword real, pero espiado: así se puede comprobar que el hash
// ficticio se ejecuta (invariante 6).
vi.mock("./password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

import * as AuditService from "../audit/audit.service";
import * as SettingsService from "../settings/settings.service";
import { disconnectUserSockets } from "../../socket/rooms";
import {
  findLoginCandidates,
  findUserWithCredential,
  registerFailedLogin,
  resetFailedLogins,
  savePasswordChange,
  updatePasswordHash,
  UserWithCredential,
} from "./auth.repository";
import {
  changeOwnPassword,
  getPublicAuthConfig,
  INVALID_CREDENTIALS_MESSAGE,
  LocalLoginError,
  loginWithLocalAccount,
} from "./local-auth.service";
import { hashPassword, verifyPassword } from "./password";

// Estos tests ejecutan scrypt de verdad (N=2^14, r=8, p=5) y varios hacen más de un login: con la
// cobertura activa y un runner lento, los 5 s por defecto no alcanzaban y el test fallaba al azar.
vi.setConfig({ testTimeout: 30_000 });

const DEFAULT_POLICY = {
  sessionTtlHours: 12,
  minLength: 12,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
  expirationDays: null,
  historyCount: 0,
  maxFailedLoginAttempts: null,
  lockoutDurationMinutes: 15,
};

const PASSWORD = "caballo correcto batería";

let passwordHash: string;

function buildCredential(overrides: Partial<LocalCredential> = {}): LocalCredential {
  return {
    userId: "user-1",
    passwordHash,
    previousPasswordHashes: [],
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildAccount(overrides: Partial<UserWithCredential> = {}): UserWithCredential {
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
    localCredential: buildCredential(),
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  passwordHash ??= await hashPassword(PASSWORD);
  vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY });
});

describe("loginWithLocalAccount", () => {
  useLocalAuth();

  it("con la contraseña correcta devuelve el token y la respuesta de §7", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount()]);

    const { record, response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

    expect(record.id).toBe("user-1");
    expect(response.user).toEqual({
      id: "user-1",
      email: "ana@example.com",
      username: "ana.perez",
      fullName: "Ana Pérez",
      roles: ["admin"],
      exp: expect.any(Number),
      authProvider: "local",
      internalUserId: "user-1",
      mustChangePassword: false,
      mustChangePasswordReason: null,
      notificationSoundEnabled: true,
      language: "es",
    });
    const payload = jwt.verify(response.token, TEST_SESSION_JWT_SECRET) as jwt.JwtPayload;
    expect(payload).toMatchObject({ sub: "user-1", iss: "link", aud: "link" });
    expect(payload.exp! - payload.iat!).toBe(12 * 3600);
    expect(payload).not.toHaveProperty("pcr");
  });

  it("busca con lo que se escribió, sin espacios alrededor (email o username, sin distinguir mayúsculas)", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount()]);

    await loginWithLocalAccount("  ANA.PEREZ ", PASSWORD);

    expect(findLoginCandidates).toHaveBeenCalledWith("ANA.PEREZ");
  });

  it("mismo mensaje y status para cuenta inexistente, contraseña incorrecta y cuenta sin contraseña (invariante 6)", async () => {
    const cases: Array<[UserWithCredential[], string]> = [
      [[], "unknown_account"],
      [[buildAccount()], "wrong_password"],
      [[buildAccount({ localCredential: null })], "no_credential"],
    ];

    for (const [candidates, reason] of cases) {
      vi.mocked(findLoginCandidates).mockResolvedValue(candidates);

      const error = await loginWithLocalAccount("ana@example.com", "otra-contraseña").catch((e) => e);

      expect(error).toBeInstanceOf(LocalLoginError);
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(error.code).toBeUndefined();
      expect(error.reason).toBe(reason);
    }
  });

  it("sin cuenta o sin contraseña igual ejecuta scrypt contra un hash ficticio (invariante 6)", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([]);
    await loginWithLocalAccount("nadie@example.com", "lo-que-sea").catch(() => undefined);

    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount({ localCredential: null })]);
    await loginWithLocalAccount("ana@example.com", "lo-que-sea").catch(() => undefined);

    expect(verifyPassword).toHaveBeenCalledTimes(2);
    for (const [password, stored] of vi.mocked(verifyPassword).mock.calls) {
      expect(password).toBe("lo-que-sea");
      expect(stored).toMatch(/^scrypt\$/);
      expect(stored).not.toBe(passwordHash);
    }
  });

  it("dos cuentas que difieren solo en mayúsculas: se rechaza con el mensaje genérico", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount(), buildAccount({ id: "user-2", email: "ANA@example.com" })]);

    const error = await loginWithLocalAccount("ana@example.com", PASSWORD).catch((e) => e);

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it("cuenta desactivada: 403 solo con la contraseña correcta; con una incorrecta, el 401 genérico", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount({ status: UserStatus.INACTIVE })]);

    const withRight = await loginWithLocalAccount("ana@example.com", PASSWORD).catch((e) => e);
    const withWrong = await loginWithLocalAccount("ana@example.com", "otra-contraseña").catch((e) => e);

    expect(withRight).toMatchObject({ statusCode: 403, code: "account_disabled", reason: "account_disabled" });
    expect(withWrong).toMatchObject({ statusCode: 401, message: INVALID_CREDENTIALS_MESSAGE });
  });

  it("contraseña restablecida por un admin -> token restringido con motivo reset (invariante 8)", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([
      buildAccount({ localCredential: buildCredential({ mustChangePassword: true }) }),
    ]);

    const { response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

    expect(response.user).toMatchObject({ mustChangePassword: true, mustChangePasswordReason: "reset" });
    expect((jwt.decode(response.token) as jwt.JwtPayload).pcr).toBe(true);
  });

  it("contraseña que no cumple la política vigente -> token restringido con motivo policy (D16)", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount()]);
    vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, requireNumber: true });

    const { response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

    expect(response.user).toMatchObject({ mustChangePassword: true, mustChangePasswordReason: "policy" });
  });

  it("la duración del token sale de la política vigente", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount()]);
    vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, sessionTtlHours: 2 });

    const { response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

    const payload = jwt.decode(response.token) as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(2 * 3600);
  });

  it("rehashea en el login si el hash usa parámetros viejos", async () => {
    const { scryptSync, randomBytes } = await import("crypto");
    const salt = randomBytes(16);
    const oldHash = ["scrypt", 1024, 8, 1, salt.toString("base64url"), scryptSync(PASSWORD.normalize("NFKC"), salt, 32, { N: 1024, r: 8, p: 1 }).toString("base64url")].join("$");
    vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount({ localCredential: buildCredential({ passwordHash: oldHash }) })]);

    await loginWithLocalAccount("ana@example.com", PASSWORD);

    expect(updatePasswordHash).toHaveBeenCalledWith("user-1", expect.stringMatching(/^scrypt\$16384\$8\$5\$/));
  });
});

describe("changeOwnPassword", () => {
  useLocalAuth();

  it("contraseña actual incorrecta -> 400 invalid_current_password, nunca 401 (invariante 11)", async () => {
    vi.mocked(findUserWithCredential).mockResolvedValue(buildAccount());

    const error = await changeOwnPassword("user-1", "no-es-esta", "una-nueva-bastante-larga").catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({ statusCode: 400, code: "invalid_current_password" });
    expect(savePasswordChange).not.toHaveBeenCalled();
  });

  it("la contraseña nueva tiene que cumplir la política: 400 password_policy con las reglas incumplidas", async () => {
    vi.mocked(findUserWithCredential).mockResolvedValue(buildAccount());
    vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, requireNumber: true });

    const error = await changeOwnPassword("user-1", PASSWORD, "corta").catch((e) => e);

    expect(error).toMatchObject({ statusCode: 400, code: "password_policy", details: { rules: ["min_length", "number"] } });
  });

  it("no se puede repetir la contraseña actual: 400 password_reused", async () => {
    vi.mocked(findUserWithCredential).mockResolvedValue(buildAccount());

    const error = await changeOwnPassword("user-1", PASSWORD, PASSWORD).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 400, code: "password_reused" });
  });

  it("guarda el hash nuevo, revoca los tokens anteriores al segundo y devuelve un token nuevo válido", async () => {
    vi.mocked(findUserWithCredential).mockResolvedValue(buildAccount());

    const { token, exp } = await changeOwnPassword("user-1", PASSWORD, "otra contraseña larga y nueva");

    const [userId, saved] = vi.mocked(savePasswordChange).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(saved.passwordHash).toMatch(/^scrypt\$/);
    await expect(verifyPassword("otra contraseña larga y nueva", saved.passwordHash)).resolves.toMatchObject({ valid: true });
    expect(saved.tokensValidAfter.getMilliseconds()).toBe(0);

    const payload = jwt.verify(token, TEST_SESSION_JWT_SECRET) as jwt.JwtPayload;
    expect(payload.exp).toBe(exp);
    expect(payload).not.toHaveProperty("pcr");
    // El token nuevo es del mismo segundo que el corte, o posterior: vale.
    expect(payload.iat!).toBeGreaterThanOrEqual(saved.tokensValidAfter.getTime() / 1000);
  });

  it("audita CHANGE_PASSWORD con el motivo, sin la contraseña, y corta los sockets abiertos (invariante 9)", async () => {
    vi.mocked(findUserWithCredential).mockResolvedValue(
      buildAccount({ localCredential: buildCredential({ mustChangePassword: true }) }),
    );

    await changeOwnPassword("user-1", PASSWORD, "otra contraseña larga y nueva");

    expect(AuditService.record).toHaveBeenCalledWith({
      action: "CHANGE_PASSWORD",
      userId: "user-1",
      actorEmail: "ana@example.com",
      metadata: { reason: "reset" },
    });
    const serialized = JSON.stringify(vi.mocked(AuditService.record).mock.calls);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("otra contraseña larga y nueva");
    expect(disconnectUserSockets).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("un cambio sin exigencia previa se audita como voluntary", async () => {
    vi.mocked(findUserWithCredential).mockResolvedValue(buildAccount());

    await changeOwnPassword("user-1", PASSWORD, "otra contraseña larga y nueva");

    expect(vi.mocked(AuditService.record).mock.calls[0][0]).toMatchObject({ metadata: { reason: "voluntary" } });
  });
});

describe("getPublicAuthConfig", () => {
  describe("con un proveedor externo", () => {
    useExternalProvider();

    it("dice quién es y sus capacidades: sin cambio de contraseña y con cuentas de solo estado", async () => {
      const config = await getPublicAuthConfig();

      expect(config).toEqual({
        provider: { id: "external-test", displayName: "External Test", external: true },
        capabilities: { passwordChange: false, accountManagement: "status-only" },
      });
      expect(config).not.toHaveProperty("passwordPolicy");
      expect(SettingsService.getLocalAuthPolicy).not.toHaveBeenCalled();
    });
  });

  describe("con cuentas locales", () => {
    useLocalAuth();

    it("suma la política de contraseñas, pero nunca la duración de sesión", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, requireSymbol: true });

      const config = await getPublicAuthConfig();

      expect(config).toEqual({
        provider: { id: "local", displayName: "LINK", external: false },
        capabilities: { passwordChange: true, accountManagement: "full" },
        passwordPolicy: {
          minLength: 12,
          maxLength: 128,
          requireUppercase: false,
          requireLowercase: false,
          requireNumber: false,
          requireSymbol: true,
          historyCount: 0,
        },
      });
      expect(JSON.stringify(config)).not.toMatch(/ttl|session|lock|attempt/i);
    });
  });

describe("política avanzada (LOCAL_AUTH_PLAN.md, Fase 6)", () => {
  useLocalAuth();

  const LOCKOUT = { ...DEFAULT_POLICY, maxFailedLoginAttempts: 5, lockoutDurationMinutes: 30 };

  describe("bloqueo por intentos fallidos (invariante 7)", () => {
    it("una cuenta bloqueada responde 429 con el mensaje del rate limit, aunque la contraseña sea correcta", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue(LOCKOUT);
      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ lockedUntil: new Date(Date.now() + 60_000) }) }),
      ]);

      const error = await loginWithLocalAccount("ana@example.com", PASSWORD).catch((e) => e);

      expect(error).toMatchObject({
        statusCode: 429,
        message: "Hiciste demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.",
        reason: "account_locked",
      });
      expect(error.code).toBeUndefined();
      expect(verifyPassword).not.toHaveBeenCalled();
    });

    it("una contraseña incorrecta suma al contador con el máximo y la duración configurados", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue(LOCKOUT);
      vi.mocked(findLoginCandidates).mockResolvedValue([buildAccount()]);

      await loginWithLocalAccount("ana@example.com", "otra-contraseña").catch(() => undefined);

      expect(registerFailedLogin).toHaveBeenCalledWith("user-1", { maxAttempts: 5, durationMinutes: 30 });
    });

    it("un login exitoso reinicia el contador", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue(LOCKOUT);
      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ failedLoginCount: 3 }) }),
      ]);

      await loginWithLocalAccount("ana@example.com", PASSWORD);

      expect(resetFailedLogins).toHaveBeenCalledWith("user-1");
    });

    it("con el bloqueo vencido, la contraseña correcta entra y limpia el bloqueo", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue(LOCKOUT);
      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ lockedUntil: new Date(Date.now() - 1000) }) }),
      ]);

      await expect(loginWithLocalAccount("ana@example.com", PASSWORD)).resolves.toBeDefined();
      expect(resetFailedLogins).toHaveBeenCalledWith("user-1");
    });
  });

  describe("vencimiento", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    it("una contraseña más vieja que el vencimiento -> token restringido con motivo expired", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, expirationDays: 90 });
      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ passwordChangedAt: new Date(Date.now() - 91 * DAY_MS) }) }),
      ]);

      const { response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

      expect(response.user).toMatchObject({ mustChangePassword: true, mustChangePasswordReason: "expired" });
    });

    it("una contraseña dentro del plazo no pide cambio", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, expirationDays: 90 });
      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ passwordChangedAt: new Date(Date.now() - 10 * DAY_MS) }) }),
      ]);

      const { response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

      expect(response.user.mustChangePassword).toBe(false);
    });

    it("prioridad de los motivos: reset, después expired, después policy", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({
        ...DEFAULT_POLICY,
        expirationDays: 1,
        requireNumber: true,
      });
      const old = new Date(Date.now() - 2 * DAY_MS);

      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ mustChangePassword: true, passwordChangedAt: old }) }),
      ]);
      expect((await loginWithLocalAccount("ana@example.com", PASSWORD)).response.user.mustChangePasswordReason).toBe("reset");

      vi.mocked(findLoginCandidates).mockResolvedValue([
        buildAccount({ localCredential: buildCredential({ passwordChangedAt: old }) }),
      ]);
      expect((await loginWithLocalAccount("ana@example.com", PASSWORD)).response.user.mustChangePasswordReason).toBe("expired");
    });
  });

  describe("historial (invariante 10)", () => {
    it("no se puede repetir una de las últimas N; una más vieja que N sí", async () => {
      const [previousB, previousA] = await Promise.all([hashPassword("contraseña B vieja"), hashPassword("contraseña A vieja")]);
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, historyCount: 2 });
      vi.mocked(findUserWithCredential).mockResolvedValue(
        buildAccount({ localCredential: buildCredential({ previousPasswordHashes: [previousB, previousA] }) }),
      );

      // Las últimas 2, contando la actual: la actual y B.
      await expect(changeOwnPassword("user-1", PASSWORD, "contraseña B vieja")).rejects.toMatchObject({
        code: "password_reused",
      });
      await expect(changeOwnPassword("user-1", PASSWORD, "contraseña A vieja")).resolves.toBeDefined();
    });

    it("guarda la contraseña saliente en el historial, podado para que con la nueva sean las últimas N", async () => {
      vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue({ ...DEFAULT_POLICY, historyCount: 3 });
      vi.mocked(findUserWithCredential).mockResolvedValue(
        buildAccount({ localCredential: buildCredential({ previousPasswordHashes: ["h-1", "h-2", "h-3"] }) }),
      );

      await changeOwnPassword("user-1", PASSWORD, "otra contraseña larga y nueva");

      expect(vi.mocked(savePasswordChange).mock.calls[0][1].previousPasswordHashes).toEqual([passwordHash, "h-1"]);
    });

    it("sin historial, la saliente no se guarda", async () => {
      vi.mocked(findUserWithCredential).mockResolvedValue(
        buildAccount({ localCredential: buildCredential({ previousPasswordHashes: ["h-1"] }) }),
      );

      await changeOwnPassword("user-1", PASSWORD, "otra contraseña larga y nueva");

      expect(vi.mocked(savePasswordChange).mock.calls[0][1].previousPasswordHashes).toEqual([]);
    });
  });

  it("con los defaults (todo apagado) el login se comporta como en la Fase 5", async () => {
    vi.mocked(findLoginCandidates).mockResolvedValue([
      buildAccount({ localCredential: buildCredential({ passwordChangedAt: new Date(0) }) }),
    ]);

    await loginWithLocalAccount("ana@example.com", "otra-contraseña").catch(() => undefined);
    const { response } = await loginWithLocalAccount("ana@example.com", PASSWORD);

    expect(registerFailedLogin).not.toHaveBeenCalled();
    expect(response.user.mustChangePassword).toBe(false);
  });
});
});
