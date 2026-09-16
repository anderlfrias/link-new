import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDENTITY_PROVIDER } from "../../constants/identity-provider.constant";

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../../config/prisma";
import {
  findAvatarFileId,
  setLocalAvatar,
  setLocalName,
  setNotificationSoundEnabled,
  updateAvatarFileId,
  upsertUserFromExternalUser,
} from "./auth.repository";

describe("auth.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
