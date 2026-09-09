import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";

vi.mock("./auth.service", () => ({
  login: vi.fn(),
  upsertUsuario: vi.fn(),
  syncProfilePicture: vi.fn(),
  getOwnProfilePictureUrl: vi.fn(),
  setProfilePicture: vi.fn(),
  removeProfilePicture: vi.fn(),
  updateOwnName: vi.fn(),
  updateNotificationSoundEnabled: vi.fn(),
}));

vi.mock("./jwt", () => ({
  mapTokenToUser: vi.fn(),
  verifyToken: vi.fn(),
}));

import * as AuthService from "./auth.service";
import { mapTokenToUser, verifyToken } from "./jwt";
import {
  deleteProfilePicture,
  getProfilePicture,
  login,
  updatePreferences,
  updateProfile,
  updateProfilePicture,
} from "./auth.controller";

describe("auth.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("responde con token y usuario mapeado cuando las credenciales son correctas", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "password123" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockToken = "signed-jwt-token";
      const mockPayload = { id: "ext-1", username: "testuser" } as any;
      const mockMapped = {
        id: "ext-1",
        email: "test@example.com",
        username: "testuser",
        fullName: "External Name",
        roles: ["user"],
        permissions: [],
        app: "chat-interno",
        exp: 123456,
      };
      const mockInternalUser = {
        id: "internal-id-1",
        name: "Local Name",
        avatarFileId: "avatar-1",
        notificationSoundEnabled: true,
        syncProfileWithIntegration: true,
      } as any;

      vi.mocked(AuthService.login).mockResolvedValue(mockToken);
      vi.mocked(verifyToken).mockReturnValue(mockPayload);
      vi.mocked(mapTokenToUser).mockReturnValue(mockMapped);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue(mockInternalUser);

      await login(req, res, next);

      expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123");
      expect(verifyToken).toHaveBeenCalledWith(mockToken);
      expect(mapTokenToUser).toHaveBeenCalledWith(mockPayload);
      expect(AuthService.upsertUsuario).toHaveBeenCalledWith(mockMapped);

      expect(res.json).toHaveBeenCalledWith({
        token: mockToken,
        user: {
          ...mockMapped,
          fullName: "Local Name",
          internalUserId: "internal-id-1",
          notificationSoundEnabled: true,
        },
      });

      expect(AuthService.syncProfilePicture).toHaveBeenCalledWith(
        "internal-id-1",
        "avatar-1",
        mockToken,
        true,
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("pasa BadRequestError a next si falta user o password", async () => {
      const req = createMockRequest({ body: { user: "onlyuser" } });
      const res = createMockResponse();
      const next = createMockNext();

      await login(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe("Ingresá tu usuario y tu contraseña.");
    });

    it("pasa el error de AuthService.login a next si falla la autenticación", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "wrong" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const authError = new Error("Auth failed");
      vi.mocked(AuthService.login).mockRejectedValue(authError);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(authError);
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe("getProfilePicture", () => {
    it("redirecciona a la URL devuelta por AuthService", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.getOwnProfilePictureUrl).mockResolvedValue("/uploads/avatars/u-123.jpg");

      await getProfilePicture(req, res, next);

      expect(AuthService.getOwnProfilePictureUrl).toHaveBeenCalledWith("u-123");
      expect(res.redirect).toHaveBeenCalledWith("/uploads/avatars/u-123.jpg");
      expect(next).not.toHaveBeenCalled();
    });

    it("pasa el error a next si getOwnProfilePictureUrl falla", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const error = new Error("Not found");
      vi.mocked(AuthService.getOwnProfilePictureUrl).mockRejectedValue(error);

      await getProfilePicture(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("updateProfilePicture", () => {
    it("llama a setProfilePicture y responde con el resultado si el archivo está presente", async () => {
      const buffer = Buffer.from("img");
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
        file: { buffer, mimetype: "image/png" } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockStored = { id: "f-1", path: "avatars/f-1.png" } as any;
      vi.mocked(AuthService.setProfilePicture).mockResolvedValue(mockStored);

      await updateProfilePicture(req, res, next);

      expect(AuthService.setProfilePicture).toHaveBeenCalledWith("u-123", buffer, "image/png");
      expect(res.json).toHaveBeenCalledWith(mockStored);
      expect(next).not.toHaveBeenCalled();
    });

    it("pasa BadRequestError a next si no se adjuntó archivo", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await updateProfilePicture(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toContain('Missing image (expected multipart/form-data field "file")');
    });
  });

  describe("deleteProfilePicture", () => {
    it("llama a removeProfilePicture y responde con status 204", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.removeProfilePicture).mockResolvedValue({} as any);

      await deleteProfilePicture(req, res, next);

      expect(AuthService.removeProfilePicture).toHaveBeenCalledWith("u-123");
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("updateProfile", () => {
    it("actualiza el nombre y devuelve el nombre actualizado", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
        body: { name: "Nuevo Nombre" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.updateOwnName).mockResolvedValue({ name: "Nuevo Nombre" } as any);

      await updateProfile(req, res, next);

      expect(AuthService.updateOwnName).toHaveBeenCalledWith("u-123", "Nuevo Nombre");
      expect(res.json).toHaveBeenCalledWith({ name: "Nuevo Nombre" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("updatePreferences", () => {
    it("actualiza notificationSoundEnabled y devuelve la preferencia actualizada", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
        body: { notificationSoundEnabled: false },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.updateNotificationSoundEnabled).mockResolvedValue({
        notificationSoundEnabled: false,
      } as any);

      await updatePreferences(req, res, next);

      expect(AuthService.updateNotificationSoundEnabled).toHaveBeenCalledWith("u-123", false);
      expect(res.json).toHaveBeenCalledWith({ notificationSoundEnabled: false });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
