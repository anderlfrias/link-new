import { LocalCredential, Prisma, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_AUTH_CONFIG, useAuthMode } from "../../test/auth-mode";
import { ConflictError, NotFoundError } from "../../utils/errors";

vi.mock("./account-admin.repository", () => ({
  runInTransaction: vi.fn(),
  findAccount: vi.fn(),
  findAccountByEmail: vi.fn(),
  isEmailTaken: vi.fn(),
  isUsernameTaken: vi.fn(),
  countOtherActiveAdmins: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  setAdminAssignedPassword: vi.fn(),
  clearLockout: vi.fn(),
  createAuditEntry: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getLocalAuthPolicy: vi.fn(),
}));

vi.mock("../auth/live-sessions", () => ({
  endLiveSessions: vi.fn(),
}));

import { endLiveSessions } from "../auth/live-sessions";
import { evaluatePasswordPolicy, verifyPassword } from "../auth/password";
import * as SettingsService from "../settings/settings.service";
import * as Repo from "./account-admin.repository";
import {
  bootstrapAdmin,
  createLocalUser,
  resetLocalPassword,
  unlockLocalUser,
  updateUserAccount,
} from "./account-admin.service";

const POLICY = {
  sessionTtlHours: 12,
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  expirationDays: null,
  historyCount: 3,
  maxFailedLoginAttempts: null,
  lockoutDurationMinutes: 15,
};

/// Transacción simulada: el callback corre con un cliente marcado, para poder
/// comprobar que el efecto y la auditoría usan la misma transacción.
const TX = { __tx: true } as unknown as Repo.Tx;

function credential(overrides: Partial<LocalCredential> = {}): LocalCredential {
  return {
    userId: "target-1",
    passwordHash: "scrypt$actual",
    previousPasswordHashes: ["scrypt$vieja-1", "scrypt$vieja-2"],
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function account(overrides: Partial<Repo.Account> = {}): Repo.Account {
  return {
    id: "target-1",
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
    roles: [],
    tokensValidAfter: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    localCredential: credential(),
    ...overrides,
  };
}

const PANEL = { userId: "admin-1", via: "panel" as const };

beforeEach(() => {
  // resetAllMocks y no clearAllMocks: un mockRejectedValue de un test no se
  // tiene que arrastrar al siguiente.
  vi.resetAllMocks();
  vi.mocked(Repo.runInTransaction).mockImplementation((fn) => fn(TX));
  vi.mocked(Repo.isEmailTaken).mockResolvedValue(false);
  vi.mocked(Repo.isUsernameTaken).mockResolvedValue(false);
  vi.mocked(Repo.countOtherActiveAdmins).mockResolvedValue(1);
  vi.mocked(Repo.updateAccount).mockImplementation(async (_tx, id, data) => account({ id, ...(data as object) }));
  vi.mocked(SettingsService.getLocalAuthPolicy).mockResolvedValue(POLICY);
});

function auditCalls() {
  return vi.mocked(Repo.createAuditEntry).mock.calls.map(([tx, data]) => ({ tx, data }));
}

describe("updateUserAccount — modo external-auth", () => {
  it("desactiva la cuenta, audita UPDATE_USER en la misma transacción y corta sus sockets (invariante 5)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    const view = await updateUserAccount(PANEL, "target-1", { status: UserStatus.INACTIVE });

    expect(Repo.updateAccount).toHaveBeenCalledWith(TX, "target-1", { status: UserStatus.INACTIVE });
    expect(auditCalls()).toEqual([
      {
        tx: TX,
        data: expect.objectContaining({
          action: "UPDATE_USER",
          targetType: "User",
          targetId: "target-1",
          metadata: { via: "panel", changed: { status: { from: "ACTIVE", to: "INACTIVE" } } },
        }),
      },
    ]);
    expect(endLiveSessions).toHaveBeenCalledWith("target-1");
    expect(view.status).toBe(UserStatus.INACTIVE);
  });

  it("solo cambia el estado: el resto de los datos los administra EXTERNAL_AUTH", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    await updateUserAccount(PANEL, "target-1", { name: "Otro", email: "otro@example.com", status: UserStatus.INACTIVE });

    expect(Repo.updateAccount).toHaveBeenCalledWith(TX, "target-1", { status: UserStatus.INACTIVE });
  });

  it("nadie puede desactivarse a sí mismo (invariante 12)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account({ id: "admin-1" }));

    await expect(updateUserAccount(PANEL, "admin-1", { status: UserStatus.INACTIVE })).rejects.toMatchObject({
      statusCode: 409,
      code: "cannot_modify_self",
    });
    expect(Repo.updateAccount).not.toHaveBeenCalled();
  });

  it("reactivar no corta sesiones", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account({ status: UserStatus.INACTIVE }));

    await updateUserAccount(PANEL, "target-1", { status: UserStatus.ACTIVE });

    expect(endLiveSessions).not.toHaveBeenCalled();
  });

  it("sin cambios no escribe ni audita", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    await updateUserAccount(PANEL, "target-1", { status: UserStatus.ACTIVE });

    expect(Repo.updateAccount).not.toHaveBeenCalled();
    expect(Repo.createAuditEntry).not.toHaveBeenCalled();
  });

  it("una cuenta inexistente -> 404", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(null);

    await expect(updateUserAccount(PANEL, "nadie", { status: UserStatus.INACTIVE })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("si falla la auditoría, la operación falla entera y no corta sesiones (transacción)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());
    vi.mocked(Repo.createAuditEntry).mockRejectedValue(new Error("audit down"));

    await expect(updateUserAccount(PANEL, "target-1", { status: UserStatus.INACTIVE })).rejects.toThrow("audit down");
    expect(endLiveSessions).not.toHaveBeenCalled();
  });
});

describe("updateUserAccount — modo local", () => {
  useAuthMode(LOCAL_AUTH_CONFIG);

  it("edita nombre, email, username y roles, con un diff sin secretos", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    await updateUserAccount(PANEL, "target-1", {
      name: "Ana P.",
      email: "ana.p@example.com",
      username: null,
      roles: ["admin"],
    });

    expect(Repo.updateAccount).toHaveBeenCalledWith(TX, "target-1", {
      name: "Ana P.",
      email: "ana.p@example.com",
      username: null,
      roles: ["admin"],
    });
    const { data } = auditCalls()[0];
    expect(data.metadata).toEqual({
      via: "panel",
      changed: {
        name: { from: "Ana Pérez", to: "Ana P." },
        email: { from: "ana@example.com", to: "ana.p@example.com" },
        username: { from: "ana.perez", to: null },
        roles: { from: [], to: ["admin"] },
      },
    });
    expect(JSON.stringify(data)).not.toContain("scrypt$");
  });

  it("desactivar en modo local además revoca los tokens (tokensValidAfter al segundo)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    await updateUserAccount(PANEL, "target-1", { status: UserStatus.INACTIVE });

    const data = vi.mocked(Repo.updateAccount).mock.calls[0][2] as { tokensValidAfter: Date };
    expect(data.tokensValidAfter.getMilliseconds()).toBe(0);
    expect(endLiveSessions).toHaveBeenCalledWith("target-1");
  });

  it("nadie puede quitarse el rol de admin a sí mismo (invariante 12)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account({ id: "admin-1", roles: ["admin"] }));

    await expect(updateUserAccount(PANEL, "admin-1", { roles: [] })).rejects.toMatchObject({ code: "cannot_modify_self" });
  });

  it("no se puede dejar la instalación sin un admin activo (invariante 12)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account({ roles: ["admin"] }));
    vi.mocked(Repo.countOtherActiveAdmins).mockResolvedValue(0);

    await expect(updateUserAccount(PANEL, "target-1", { roles: [] })).rejects.toMatchObject({ code: "last_admin" });
    await expect(updateUserAccount(PANEL, "target-1", { status: UserStatus.INACTIVE })).rejects.toMatchObject({
      code: "last_admin",
    });
    expect(Repo.updateAccount).not.toHaveBeenCalled();
  });

  it("con otro admin activo, sí se puede quitarle el rol a uno", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account({ roles: ["admin"] }));
    vi.mocked(Repo.countOtherActiveAdmins).mockResolvedValue(1);

    await expect(updateUserAccount(PANEL, "target-1", { roles: [] })).resolves.toBeDefined();
  });

  it("email o username en uso por otra cuenta -> 409 con code", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());
    vi.mocked(Repo.isEmailTaken).mockResolvedValue(true);
    await expect(updateUserAccount(PANEL, "target-1", { email: "otra@example.com" })).rejects.toMatchObject({
      code: "email_taken",
    });

    vi.mocked(Repo.isEmailTaken).mockResolvedValue(false);
    vi.mocked(Repo.isUsernameTaken).mockResolvedValue(true);
    await expect(updateUserAccount(PANEL, "target-1", { username: "otro" })).rejects.toMatchObject({
      code: "username_taken",
    });
  });

  it("una carrera contra el índice único también es un 409, no un 500", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());
    vi.mocked(Repo.updateAccount).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7", meta: { target: ["username"] } }),
    );

    await expect(updateUserAccount(PANEL, "target-1", { username: "otro" })).rejects.toMatchObject({
      statusCode: 409,
      code: "username_taken",
    });
  });
});

describe("createLocalUser", () => {
  useAuthMode(LOCAL_AUTH_CONFIG);

  it("sin contraseña genera una temporal que cumple la política, y la devuelve una sola vez", async () => {
    vi.mocked(Repo.createAccount).mockImplementation(async (_tx, data, cred) =>
      account({ id: "new-1", ...data, localCredential: credential({ userId: "new-1", passwordHash: cred.passwordHash, mustChangePassword: true }) }),
    );

    const result = await createLocalUser(PANEL, { name: "Beto", email: "beto@example.com", roles: ["admin"] });

    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(evaluatePasswordPolicy(result.temporaryPassword!, POLICY)).toEqual([]);
    const [, data, cred] = vi.mocked(Repo.createAccount).mock.calls[0];
    expect(data).toEqual({ name: "Beto", email: "beto@example.com", username: null, roles: ["admin"] });
    await expect(verifyPassword(result.temporaryPassword!, cred.passwordHash)).resolves.toMatchObject({ valid: true });
    expect(result.user).toMatchObject({ id: "new-1", hasPassword: true, mustChangePassword: true });
  });

  it("audita CREATE_USER con via y roles, sin la contraseña ni el hash (invariante 9)", async () => {
    vi.mocked(Repo.createAccount).mockResolvedValue(account({ id: "new-1" }));

    const result = await createLocalUser(PANEL, { name: "Beto", email: "beto@example.com" });

    const { tx, data } = auditCalls()[0];
    expect(tx).toBe(TX);
    expect(data).toMatchObject({ action: "CREATE_USER", targetId: "new-1", metadata: { via: "panel", roles: [] } });
    expect(JSON.stringify(data)).not.toContain(result.temporaryPassword);
    expect(JSON.stringify(data)).not.toContain("scrypt$");
  });

  it("con una contraseña elegida por el admin, no la devuelve y tiene que cumplir la política", async () => {
    vi.mocked(Repo.createAccount).mockResolvedValue(account({ id: "new-1" }));

    await expect(createLocalUser(PANEL, { name: "Beto", email: "beto@example.com", password: "corta" })).rejects.toMatchObject({
      statusCode: 400,
      code: "password_policy",
    });
    const result = await createLocalUser(PANEL, { name: "Beto", email: "beto@example.com", password: "Una-Clave-Larga-2026" });
    expect(result).not.toHaveProperty("temporaryPassword");
  });

  it("email o username en uso -> 409 y no crea nada", async () => {
    vi.mocked(Repo.isEmailTaken).mockResolvedValue(true);

    await expect(createLocalUser(PANEL, { name: "Beto", email: "ana@example.com" })).rejects.toBeInstanceOf(ConflictError);
    expect(Repo.createAccount).not.toHaveBeenCalled();
  });

  it("en modo external-auth no existe", async () => {
    const env = (await import("../../config/env")).default;
    const original = env.auth;
    env.auth = { mode: "external-auth", sessionSecret: original.sessionSecret, external-auth: { apiUrl: "https://x.test", appCode: "x", jwtSecret: "x" } };
    try {
      await expect(createLocalUser(PANEL, { name: "Beto", email: "beto@example.com" })).rejects.toMatchObject({
        code: "local_auth_not_enabled",
      });
    } finally {
      env.auth = original;
    }
  });
});

describe("resetLocalPassword", () => {
  useAuthMode(LOCAL_AUTH_CONFIG);

  it("deja una temporal con cambio obligatorio, pasa la actual al historial, revoca tokens y corta sockets", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    const { temporaryPassword } = await resetLocalPassword(PANEL, "target-1", {});

    const [tx, userId, data] = vi.mocked(Repo.setAdminAssignedPassword).mock.calls[0];
    expect(tx).toBe(TX);
    expect(userId).toBe("target-1");
    await expect(verifyPassword(temporaryPassword!, data.passwordHash)).resolves.toMatchObject({ valid: true });
    // historyCount 3: con la nueva, las últimas 3 son la nueva, la que tenía y la anterior.
    expect(data.previousPasswordHashes).toEqual(["scrypt$actual", "scrypt$vieja-1"]);
    expect(Repo.updateAccount).toHaveBeenCalledWith(TX, "target-1", { tokensValidAfter: expect.any(Date) });
    expect(auditCalls()[0].data).toMatchObject({ action: "RESET_PASSWORD", targetId: "target-1", metadata: { via: "panel" } });
    expect(endLiveSessions).toHaveBeenCalledWith("target-1");
  });

  it("le da contraseña a una cuenta que no tenía (por ejemplo, de la época EXTERNAL_AUTH)", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account({ localCredential: null }));

    await resetLocalPassword(PANEL, "target-1", {});

    expect(vi.mocked(Repo.setAdminAssignedPassword).mock.calls[0][2].previousPasswordHashes).toEqual([]);
  });

  it("una cuenta inexistente -> 404", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(null);

    await expect(resetLocalPassword(PANEL, "nadie", {})).rejects.toBeInstanceOf(NotFoundError);
    expect(endLiveSessions).not.toHaveBeenCalled();
  });
});

describe("unlockLocalUser", () => {
  useAuthMode(LOCAL_AUTH_CONFIG);

  it("desbloquea una cuenta bloqueada y lo audita como UPDATE_USER locked", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(
      account({ localCredential: credential({ lockedUntil: new Date(Date.now() + 60_000), failedLoginCount: 0 }) }),
    );

    await unlockLocalUser(PANEL, "target-1");

    expect(Repo.clearLockout).toHaveBeenCalledWith(TX, "target-1");
    expect(auditCalls()[0].data).toMatchObject({
      action: "UPDATE_USER",
      metadata: { via: "panel", changed: { locked: { from: true, to: false } } },
    });
  });

  it("una cuenta sin bloqueo ni fallos no cambia nada", async () => {
    vi.mocked(Repo.findAccount).mockResolvedValue(account());

    await unlockLocalUser(PANEL, "target-1");

    expect(Repo.clearLockout).not.toHaveBeenCalled();
    expect(Repo.createAuditEntry).not.toHaveBeenCalled();
  });
});

describe("bootstrapAdmin (CLI create-admin, D18)", () => {
  useAuthMode(LOCAL_AUTH_CONFIG);

  it("sin cuenta con ese correo, crea una admin con contraseña temporal", async () => {
    vi.mocked(Repo.findAccountByEmail).mockResolvedValue(null);
    vi.mocked(Repo.createAccount).mockResolvedValue(account({ id: "new-admin" }));

    const result = await bootstrapAdmin({ email: "jefa@example.com" });

    expect(result).toMatchObject({ userId: "new-admin", created: true, temporaryPassword: expect.any(String) });
    expect(vi.mocked(Repo.createAccount).mock.calls[0][1]).toEqual({
      name: "jefa",
      email: "jefa@example.com",
      username: null,
      roles: ["admin"],
    });
    expect(auditCalls()[0].data).toMatchObject({ action: "CREATE_USER", metadata: { via: "cli", roles: ["admin"] } });
  });

  it("sobre una cuenta existente (por ejemplo de EXTERNAL_AUTH) conserva su User.id y le da credencial y rol admin", async () => {
    vi.mocked(Repo.findAccountByEmail).mockResolvedValue(
      account({ id: "external-auth-era-1", roles: [], localCredential: null, status: UserStatus.INACTIVE }),
    );

    const result = await bootstrapAdmin({ email: "ana@example.com" });

    expect(result).toMatchObject({ userId: "external-auth-era-1", created: false });
    expect(Repo.createAccount).not.toHaveBeenCalled();
    expect(vi.mocked(Repo.setAdminAssignedPassword).mock.calls[0][1]).toBe("external-auth-era-1");
    expect(Repo.updateAccount).toHaveBeenCalledWith(TX, "external-auth-era-1", {
      roles: ["admin"],
      status: UserStatus.ACTIVE,
      tokensValidAfter: expect.any(Date),
    });
    expect(auditCalls().map(({ data }) => data.action)).toEqual(["UPDATE_USER", "RESET_PASSWORD"]);
    expect(auditCalls()[0].data.metadata).toEqual({
      via: "cli",
      changed: { roles: { from: [], to: ["admin"] }, status: { from: "INACTIVE", to: "ACTIVE" } },
    });
  });
});
