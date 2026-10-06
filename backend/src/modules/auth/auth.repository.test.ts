import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDENTITY_PROVIDER } from "../../constants/identity-provider.constant";

const warn = vi.fn();
vi.mock("../../config/request-context", () => ({
  getLogger: () => ({ warn }),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    localCredential: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../config/prisma";
import {
  findAvatarFileId,
  findLoginCandidates,
  registerFailedLogin,
  resetFailedLogins,
  savePasswordChange,
  setLocalAvatar,
  setLocalName,
  setNotificationSoundEnabled,
  updateAvatarFileId,
  updateUserPreferences,
  upsertUserFromExternalUser,
} from "./auth.repository";

describe("auth.repository", () => {
  beforeEach(() => {
    // resetAllMocks: un mockResolvedValue de un test no se arrastra al siguiente.
    vi.resetAllMocks();
  });

  describe("upsertUserFromExternalUser — migración entre modos (LOCAL_AUTH_PLAN.md, D20 y §10)", () => {
    const fromExternalUser = { id: "ext-1", email: "Ana@Example.com", username: "ana", fullName: "Ana de EXTERNAL_AUTH" };

    it("local -> external-auth: adopta la cuenta local con el mismo correo aunque difiera en mayúsculas, conservando su User.id", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst)
        .mockResolvedValueOnce({ id: "local-1", email: "ana@example.com", syncProfileWithIntegration: false } as any)
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: "local-1" } as any);

      const user = await upsertUserFromExternalUser(fromExternalUser);

      expect(prisma.user.findFirst).toHaveBeenNthCalledWith(1, {
        where: { email: { equals: "Ana@Example.com", mode: "insensitive" } },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      // El correo pasa a ser el de EXTERNAL_AUTH: con ese se la busca en cada request.
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "local-1" },
        data: { username: "ana", email: "Ana@Example.com" },
      });
      expect(user.id).toBe("local-1");
    });

    it("en modo external-auth manda el username de EXTERNAL_AUTH: se le quita a la otra cuenta, sin 500 (invariante 13)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "external-auth-1", email: "Ana@Example.com", syncProfileWithIntegration: true } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "otra-1" } as any);
      vi.mocked(prisma.user.update).mockImplementation(((args: any) => Promise.resolve({ id: args.where.id })) as any);
      vi.mocked(prisma.$transaction).mockImplementation(((ops: Promise<unknown>[]) => Promise.all(ops)) as any);

      const user = await upsertUserFromExternalUser(fromExternalUser);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { username: { equals: "ana", mode: "insensitive" }, id: { not: "external-auth-1" } },
        select: { id: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "otra-1" }, data: { username: null } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(user.id).toBe("external-auth-1");
      // El aviso lleva UUIDs, nunca el correo ni el username.
      expect(warn).toHaveBeenCalledWith({ userId: "otra-1", adoptedByUserId: "external-auth-1" }, expect.any(String));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Ana@|"ana"/);
    });

    it("una cuenta nueva de EXTERNAL_AUTH también le quita el username a quien lo tenía", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "otra-1" } as any);
      vi.mocked(prisma.user.create).mockResolvedValue({ id: "nueva-1" } as any);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: "otra-1" } as any);
      vi.mocked(prisma.$transaction).mockImplementation(((ops: Promise<unknown>[]) => Promise.all(ops)) as any);

      const user = await upsertUserFromExternalUser(fromExternalUser);

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "otra-1" }, data: { username: null } });
      expect(user.id).toBe("nueva-1");
    });
  });

  describe("upsertUserFromExternalUser", () => {
    const mappedUser = {
      id: "ext-1",
      email: "test@example.com",
      username: "testuser",
      fullName: "Test User",
    };

    it("crea un nuevo usuario si no existe previamente", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const mockCreatedUser = { ...mappedUser, id: "internal-1" } as any;
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreatedUser);

      const result = await upsertUserFromExternalUser(mappedUser);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: mappedUser.email },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: mappedUser.email,
          name: mappedUser.fullName,
          username: mappedUser.username,
          externalId: mappedUser.id,
          identityProvider: IDENTITY_PROVIDER.EXTERNAL_AUTH,
        },
      });
      expect(result).toBe(mockCreatedUser);
    });

    it("actualiza username y name si el usuario existe y syncProfileWithIntegration es true", async () => {
      const existingUser = {
        id: "internal-1",
        email: "test@example.com",
        username: "olduser",
        name: "Old Name",
        syncProfileWithIntegration: true,
      } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      const mockUpdatedUser = { ...existingUser, ...mappedUser } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUpdatedUser);

      const result = await upsertUserFromExternalUser(mappedUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "internal-1" },
        data: {
          username: mappedUser.username,
          name: mappedUser.fullName,
        },
      });
      expect(result).toBe(mockUpdatedUser);
    });

    it("actualiza solo username y preserva name si syncProfileWithIntegration es false", async () => {
      const existingUser = {
        id: "internal-1",
        email: "test@example.com",
        username: "olduser",
        name: "Custom Local Name",
        syncProfileWithIntegration: false,
      } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      const mockUpdatedUser = { ...existingUser, username: mappedUser.username } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUpdatedUser);

      const result = await upsertUserFromExternalUser(mappedUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "internal-1" },
        data: {
          username: mappedUser.username,
        },
      });
      expect(result).toBe(mockUpdatedUser);
    });
  });

  describe("updateAvatarFileId", () => {
    it("nunca toca status: una cuenta desactivada sigue desactivada aunque EXTERNAL_AUTH la sincronice (invariante 5)", async () => {
      const existingUser = { id: "internal-1", email: "test@example.com", status: "INACTIVE", syncProfileWithIntegration: true } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(existingUser);

      await upsertUserFromExternalUser({ id: "ext-1", email: "test@example.com", username: "testuser", fullName: "Test User" });

      const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0];
      expect(updateArgs.data).not.toHaveProperty("status");
    });

    it("actualiza el avatarFileId sin alterar syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", avatarFileId: "file-1" } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await updateAvatarFileId("u-1", "file-1");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { avatarFileId: "file-1" },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("setLocalAvatar", () => {
    it("actualiza avatarFileId y desactiva syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", avatarFileId: "file-2", syncProfileWithIntegration: false } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await setLocalAvatar("u-1", "file-2");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { avatarFileId: "file-2", syncProfileWithIntegration: false },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("setLocalName", () => {
    it("actualiza el nombre y desactiva syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", name: "Nuevo Nombre", syncProfileWithIntegration: false } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await setLocalName("u-1", "Nuevo Nombre");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { name: "Nuevo Nombre", syncProfileWithIntegration: false },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("setNotificationSoundEnabled", () => {
    it("actualiza la preferencia sin tocar syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: false } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await setNotificationSoundEnabled("u-1", false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { notificationSoundEnabled: false },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("updateUserPreferences", () => {
    it("actualiza preferencias combinadas (idioma y sonido)", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: true, language: "en" } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await updateUserPreferences("u-1", { notificationSoundEnabled: true, language: "en" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { notificationSoundEnabled: true, language: "en" },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("findAvatarFileId", () => {
    it("devuelve el avatarFileId cuando el usuario y su avatar activo existen", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        avatarFileId: "file-123",
        avatarFile: { deletedAt: null },
      } as any);

      const result = await findAvatarFileId("u-1");

      expect(result).toBe("file-123");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "u-1" },
        select: {
          avatarFileId: true,
          avatarFile: { select: { deletedAt: true } },
        },
      });
    });

    it("devuelve null si el avatarFile está marcado como eliminado", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        avatarFileId: "file-123",
        avatarFile: { deletedAt: new Date() },
      } as any);

      expect(await findAvatarFileId("u-1")).toBeNull();
    });

    it("devuelve null si el usuario no tiene avatar o no existe", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      expect(await findAvatarFileId("u-nonexistent")).toBeNull();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({ avatarFileId: null, avatarFile: null } as any);
      expect(await findAvatarFileId("u-no-avatar")).toBeNull();
    });
  });

  describe("findLoginCandidates (LOCAL_AUTH_PLAN.md, D10)", () => {
    it("con @ busca por email, sin distinguir mayúsculas, con la credencial, hasta 2 filas", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await findLoginCandidates("Ana@Example.com");

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { email: { equals: "Ana@Example.com", mode: "insensitive" } },
        include: { localCredential: true },
        take: 2,
      });
    });

    it("sin @ busca por username", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await findLoginCandidates("Ana.Perez");

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: { equals: "Ana.Perez", mode: "insensitive" } } }),
      );
    });
  });

  describe("savePasswordChange", () => {
    it("actualiza la credencial y revoca los tokens en una sola transacción", async () => {
      vi.mocked(prisma.localCredential.update).mockReturnValue("credential-op" as any);
      vi.mocked(prisma.user.update).mockReturnValue("user-op" as any);
      const cut = new Date("2026-10-06T12:00:00.000Z");

      await savePasswordChange("user-1", { passwordHash: "scrypt$nuevo", previousPasswordHashes: [], tokensValidAfter: cut });

      expect(prisma.$transaction).toHaveBeenCalledWith(["credential-op", "user-op"]);
      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          passwordHash: "scrypt$nuevo",
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        }),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { tokensValidAfter: cut } });
    });
  });

  describe("registerFailedLogin / resetFailedLogins (D17)", () => {
    const LOCK = { maxAttempts: 3, durationMinutes: 15 };

    it("incrementa el contador de forma atómica y no bloquea antes del máximo", async () => {
      vi.mocked(prisma.localCredential.update).mockResolvedValue({ failedLoginCount: 2 } as any);

      await expect(registerFailedLogin("user-1", LOCK)).resolves.toBe(false);

      expect(prisma.localCredential.update).toHaveBeenCalledTimes(1);
      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
    });

    it("al llegar al máximo bloquea por la duración configurada y reinicia el contador", async () => {
      vi.mocked(prisma.localCredential.update).mockResolvedValueOnce({ failedLoginCount: 3 } as any);
      const before = Date.now();

      await expect(registerFailedLogin("user-1", LOCK)).resolves.toBe(true);

      const lockCall = vi.mocked(prisma.localCredential.update).mock.calls[1][0] as any;
      expect(lockCall.data.failedLoginCount).toBe(0);
      expect(lockCall.data.lockedUntil.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
    });

    it("resetFailedLogins limpia el contador y el bloqueo", async () => {
      vi.mocked(prisma.localCredential.update).mockResolvedValue({} as any);

      await resetFailedLogins("user-1");

      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });
});
