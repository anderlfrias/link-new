import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findAvatarFileId: vi.fn(),
  findUserById: vi.fn(),
  setLocalAvatar: vi.fn(),
  setLocalName: vi.fn(),
  updateAvatarFileId: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("../files/file.service", () => ({
  storeAvatar: vi.fn(),
  getFileChecksum: vi.fn(),
}));

import {
  findAvatarFileId,
  findUserById,
  setLocalAvatar,
  setLocalName,
  updateAvatarFileId,
  updateUserPreferences,
} from "./auth.repository";
import * as FileService from "../files/file.service";
import {
  getOwnProfilePictureUrl,
  removeProfilePicture,
  setAvatarFromProvider,
  setProfilePicture,
  updateNotificationSoundEnabled,
  updateOwnName,
  updatePreferences,
} from "./auth.service";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auth.service", () => {
  describe("setAvatarFromProvider — el avatar que entrega el proveedor externo", () => {
    const image = { data: Buffer.from("nueva-imagen"), mimeType: "image/png" };

    function stubUser(overrides: Record<string, unknown> = {}) {
      vi.mocked(findUserById).mockResolvedValue({
        id: "u-1",
        avatarFileId: null,
        syncProfileWithIntegration: true,
        ...overrides,
      } as never);
    }

    it("cachea el avatar si el checksum de lo recibido difiere del ya guardado", async () => {
      stubUser({ avatarFileId: "old-avatar-file-id" });
      vi.mocked(FileService.getFileChecksum).mockResolvedValue("checksum-completamente-distinto");
      vi.mocked(FileService.storeAvatar).mockResolvedValue({ id: "stored-new" } as never);

      await setAvatarFromProvider("u-1", image);

      expect(FileService.getFileChecksum).toHaveBeenCalledWith("old-avatar-file-id");
      expect(FileService.storeAvatar).toHaveBeenCalledWith("u-1", image.data, "image/png");
      expect(updateAvatarFileId).toHaveBeenCalledWith("u-1", "stored-new");
    });

    it("NO recachea si el checksum coincide con el ya guardado (evita reescribir sin cambios)", async () => {
      const same = { data: Buffer.from("misma-imagen-de-siempre"), mimeType: "image/png" };
      stubUser({ avatarFileId: "current-avatar-file-id" });
      vi.mocked(FileService.getFileChecksum).mockResolvedValue(createHash("sha256").update(same.data).digest("hex"));

      await setAvatarFromProvider("u-1", same);

      expect(FileService.storeAvatar).not.toHaveBeenCalled();
      expect(updateAvatarFileId).not.toHaveBeenCalled();
    });

    it("si no había avatar cacheado antes, cachea directo sin comparar checksum", async () => {
      stubUser();
      vi.mocked(FileService.storeAvatar).mockResolvedValue({ id: "stored-1" } as never);

      await setAvatarFromProvider("u-1", image);

      expect(FileService.getFileChecksum).not.toHaveBeenCalled();
      expect(FileService.storeAvatar).toHaveBeenCalled();
      expect(updateAvatarFileId).toHaveBeenCalledWith("u-1", "stored-1");
    });

    it("null (el proveedor ya no tiene foto) limpia el avatar si había uno cacheado", async () => {
      stubUser({ avatarFileId: "old-avatar-file-id" });

      await setAvatarFromProvider("u-1", null);

      expect(updateAvatarFileId).toHaveBeenCalledWith("u-1", null);
    });

    it("null no hace nada si tampoco había un avatar cacheado", async () => {
      stubUser();

      await setAvatarFromProvider("u-1", null);

      expect(updateAvatarFileId).not.toHaveBeenCalled();
    });

    it("no pisa el avatar de quien ya eligió su foto o su nombre en LINK (syncProfileWithIntegration false)", async () => {
      stubUser({ syncProfileWithIntegration: false, avatarFileId: "mi-foto" });

      await setAvatarFromProvider("u-1", image);
      await setAvatarFromProvider("u-1", null);

      expect(FileService.storeAvatar).not.toHaveBeenCalled();
      expect(updateAvatarFileId).not.toHaveBeenCalled();
    });

    it("no hace nada si la cuenta ya no existe", async () => {
      vi.mocked(findUserById).mockResolvedValue(null);

      await setAvatarFromProvider("u-fantasma", image);

      expect(FileService.storeAvatar).not.toHaveBeenCalled();
    });
  });

  describe("getOwnProfilePictureUrl", () => {
    it("devuelve la URL segura de contenido si el avatar existe", async () => {
      vi.mocked(findAvatarFileId).mockResolvedValue("f-avatar-1");

      const url = await getOwnProfilePictureUrl("user-1");

      expect(findAvatarFileId).toHaveBeenCalledWith("user-1");
      expect(url).toBe("/api/v1/files/f-avatar-1/content");
    });

    it("lanza NotFoundError si el usuario no tiene avatar cacheado", async () => {
      vi.mocked(findAvatarFileId).mockResolvedValue(null);

      await expect(getOwnProfilePictureUrl("user-without-avatar")).rejects.toThrow(NotFoundError);
      await expect(getOwnProfilePictureUrl("user-without-avatar")).rejects.toThrow("Profile picture not found");
    });
  });

  describe("setProfilePicture", () => {
    it("guarda el avatar mediante FileService y actualiza el usuario localmente", async () => {
      const buffer = Buffer.from("image-content");
      const storedFile = { id: "stored-1", path: "avatars/stored-1.png" } as never;
      vi.mocked(FileService.storeAvatar).mockResolvedValue(storedFile);

      const result = await setProfilePicture("u-1", buffer, "image/png");

      expect(FileService.storeAvatar).toHaveBeenCalledWith("u-1", buffer, "image/png");
      expect(setLocalAvatar).toHaveBeenCalledWith("u-1", "stored-1");
      expect(result).toBe(storedFile);
    });
  });

  describe("removeProfilePicture", () => {
    it("elimina el avatar asignando null en setLocalAvatar", async () => {
      const mockUser = { id: "u-1", avatarFileId: null } as never;
      vi.mocked(setLocalAvatar).mockResolvedValue(mockUser);

      const result = await removeProfilePicture("u-1");

      expect(setLocalAvatar).toHaveBeenCalledWith("u-1", null);
      expect(result).toBe(mockUser);
    });
  });

  describe("updateOwnName", () => {
    it("llama a setLocalName en el repositorio", async () => {
      const mockUser = { id: "u-1", name: "Nuevo" } as never;
      vi.mocked(setLocalName).mockResolvedValue(mockUser);

      const result = await updateOwnName("u-1", "Nuevo");

      expect(setLocalName).toHaveBeenCalledWith("u-1", "Nuevo");
      expect(result).toBe(mockUser);
    });
  });

  describe("updateNotificationSoundEnabled", () => {
    it("llama a updateUserPreferences a través de updatePreferences", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: true } as never;
      vi.mocked(updateUserPreferences).mockResolvedValue(mockUser);

      const result = await updateNotificationSoundEnabled("u-1", true);

      expect(updateUserPreferences).toHaveBeenCalledWith("u-1", { notificationSoundEnabled: true });
      expect(result).toBe(mockUser);
    });
  });

  describe("updatePreferences", () => {
    it("delega a updateUserPreferences en el repositorio con notificationSoundEnabled y language", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: false, language: "en" } as never;
      vi.mocked(updateUserPreferences).mockResolvedValue(mockUser);

      const result = await updatePreferences("u-1", { notificationSoundEnabled: false, language: "en" });

      expect(updateUserPreferences).toHaveBeenCalledWith("u-1", { notificationSoundEnabled: false, language: "en" });
      expect(result).toBe(mockUser);
    });
  });
});
