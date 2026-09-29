import { beforeEach, describe, expect, it, vi } from "vitest";
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
  updatePreferences: vi.fn(),
}));

vi.mock("./jwt", () => ({
  mapTokenToUser: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock("../audit/audit.service");

import * as AuditService from "../audit/audit.service";
import { AuditAction } from "@prisma/client";
import {
  BadRequestError,
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";
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
    it("responde con token y usuario mapeado cuando las credenciales son correctas y audita LOGIN", async () => {
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
        language: "es",
        syncProfileWithIntegration: true,
      } as any;

      vi.mocked(AuthService.login).mockResolvedValue(mockToken);
      vi.mocked(verifyToken).mockReturnValue(mockPayload);
      vi.mocked(mapTokenToUser).mockReturnValue(mockMapped);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue(mockInternalUser);

      await login(req, res, next);

      expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", undefined);
      expect(verifyToken).toHaveBeenCalledWith(mockToken);
      expect(mapTokenToUser).toHaveBeenCalledWith(mockPayload);
      expect(AuthService.upsertUsuario).toHaveBeenCalledWith(mockMapped);

      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN,
        userId: "internal-id-1",
        actorEmail: "test@example.com",
      });

      expect(res.json).toHaveBeenCalledWith({
        token: mockToken,
        user: {
          ...mockMapped,
          fullName: "Local Name",
          internalUserId: "internal-id-1",
          notificationSoundEnabled: true,
          language: "es",
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

    it("pasa req.ip a AuthService.login cuando no hay header cf-connecting-ip", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "password123" },
        ip: "203.0.113.10",
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.login).mockResolvedValue("mock-token");
      vi.mocked(verifyToken).mockReturnValue({ id: "ext-1", username: "testuser" } as any);
      vi.mocked(mapTokenToUser).mockReturnValue({ id: "ext-1", email: "test@example.com", username: "testuser" } as any);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue({ id: "int-1", name: "User" } as any);

      await login(req, res, next);

      expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", "203.0.113.10");
    });

    it("prioriza el header cf-connecting-ip y lo pasa a AuthService.login cuando está presente", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "password123" },
        ip: "10.0.0.1",
        headers: { "cf-connecting-ip": "198.51.100.77" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.login).mockResolvedValue("mock-token");
      vi.mocked(verifyToken).mockReturnValue({ id: "ext-1", username: "testuser" } as any);
      vi.mocked(mapTokenToUser).mockReturnValue({ id: "ext-1", email: "test@example.com", username: "testuser" } as any);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue({ id: "int-1", name: "User" } as any);

      await login(req, res, next);

      expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", "198.51.100.77");
    });

    it("pasa BadRequestError a next si falta user o password y NO audita", async () => {
      const req = createMockRequest({ body: { user: "onlyuser" } });
      const res = createMockResponse();
      const next = createMockNext();

      await login(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe("Ingresá tu usuario y tu contraseña.");
      expect(AuditService.record).not.toHaveBeenCalled();
    });

    it("audita LOGIN_FAILED con forbidden_by_provider y propaga ForbiddenError (403)", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "wrongpassword" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const forbiddenError = new ForbiddenError("No pudimos verificar tus credenciales.");
      vi.mocked(AuthService.login).mockRejectedValue(forbiddenError);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(forbiddenError);
      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN_FAILED,
        userId: null,
        actorEmail: "testuser",
        metadata: { reason: "forbidden_by_provider" },
      });
      // La contraseña nunca debe viajar a la auditoría
      const auditCall = vi.mocked(AuditService.record).mock.calls[0][0];
      expect(JSON.stringify(auditCall)).not.toContain("wrongpassword");
      expect(res.json).not.toHaveBeenCalled();
    });

    it("audita LOGIN_FAILED con invalid_credentials y propaga UnauthorizedError (401)", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "wrongpassword" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const unauthorizedError = new UnauthorizedError("Usuario o contraseña incorrectos.");
      vi.mocked(AuthService.login).mockRejectedValue(unauthorizedError);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(unauthorizedError);
      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN_FAILED,
        userId: null,
        actorEmail: "testuser",
        metadata: { reason: "invalid_credentials" },
      });
    });

    it("audita LOGIN_FAILED con provider_unreachable si fetch tira timeout/red", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "secretpassword" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const networkError = new ServiceUnavailableError(
        "No pudimos conectar con el servicio de autenticación.",
        "provider_unreachable",
      );
      vi.mocked(AuthService.login).mockRejectedValue(networkError);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(networkError);
      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN_FAILED,
        userId: null,
        actorEmail: "testuser",
        metadata: { reason: "provider_unreachable" },
      });
      // Verificación de que la contraseña no aparece en ningún campo de la auditoría
      const auditCall = vi.mocked(AuditService.record).mock.calls[0][0];
      expect(JSON.stringify(auditCall)).not.toContain("secretpassword");
    });

    it("audita LOGIN_FAILED con provider_error si el proveedor responde status no ok", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "password" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const providerError = new ServiceUnavailableError(
        "No pudimos conectar con el servicio de autenticación.",
        "provider_error",
      );
      vi.mocked(AuthService.login).mockRejectedValue(providerError);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(providerError);
      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN_FAILED,
        userId: null,
        actorEmail: "testuser",
        metadata: { reason: "provider_error" },
      });
    });
  });

  describe("getProfilePicture", () => {
    it("redirecciona a la URL devuelta por AuthService", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.getOwnProfilePictureUrl).mockResolvedValue("/api/v1/files/avatar-123/content");

      await getProfilePicture(req, res, next);

      expect(AuthService.getOwnProfilePictureUrl).toHaveBeenCalledWith("u-123");
      expect(res.redirect).toHaveBeenCalledWith("/api/v1/files/avatar-123/content");
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
    it("actualiza notificationSoundEnabled y devuelve las preferencias actualizadas", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
        body: { notificationSoundEnabled: false },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.updatePreferences).mockResolvedValue({
        notificationSoundEnabled: false,
        language: "es",
      } as any);

      await updatePreferences(req, res, next);

      expect(AuthService.updatePreferences).toHaveBeenCalledWith("u-123", { notificationSoundEnabled: false });
      expect(res.json).toHaveBeenCalledWith({ notificationSoundEnabled: false, language: "es" });
      expect(next).not.toHaveBeenCalled();
    });

    it("actualiza language y devuelve las preferencias actualizadas", async () => {
      const req = createMockRequest({
        user: { internalUserId: "u-123" } as any,
        body: { language: "en" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(AuthService.updatePreferences).mockResolvedValue({
        notificationSoundEnabled: true,
        language: "en",
      } as any);

      await updatePreferences(req, res, next);

      expect(AuthService.updatePreferences).toHaveBeenCalledWith("u-123", { language: "en" });
      expect(res.json).toHaveBeenCalledWith({ notificationSoundEnabled: true, language: "en" });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
