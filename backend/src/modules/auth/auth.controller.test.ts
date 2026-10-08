import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";

vi.mock("./auth.service", () => ({
  getOwnProfilePictureUrl: vi.fn(),
  setProfilePicture: vi.fn(),
  removeProfilePicture: vi.fn(),
  updateOwnName: vi.fn(),
  updateNotificationSoundEnabled: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("../audit/audit.service");

vi.mock("./local-auth.service", () => ({
  loginWithLocalAccount: vi.fn(),
  changeOwnPassword: vi.fn(),
  getPublicAuthConfig: vi.fn(),
}));

vi.mock("./external-login.service", () => ({
  loginWithExternalProvider: vi.fn(),
}));

import env from "../../config/env";
import * as AuditService from "../audit/audit.service";
import { AuditAction } from "@prisma/client";
import {
  BadRequestError,
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";
import * as AuthService from "./auth.service";
import { LocalLoginError } from "./auth.errors";
import * as ExternalLoginService from "./external-login.service";
import * as LocalAuthService from "./local-auth.service";
import { createFakeProvider, useExternalProvider, useLocalAuth } from "../../test/auth-mode";
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
    describe("con un proveedor de autenticación externo", () => {
      const provider = createFakeProvider({ id: "mi-proveedor" });
      useExternalProvider(provider);

      const account = { id: "internal-id-1", email: "test@example.com" } as never;
      const response = { token: "sesion-de-link", user: { internalUserId: "internal-id-1" } } as never;

      beforeEach(() => {
        vi.mocked(ExternalLoginService.loginWithExternalProvider).mockResolvedValue({ record: account, response });
      });

      it("delega en el proveedor, responde con lo que devuelve y audita LOGIN con el id del proveedor", async () => {
        const req = createMockRequest({ body: { user: "testuser", password: "password123" }, ip: "203.0.113.10" });
        const res = createMockResponse();
        const next = createMockNext();

        await login(req, res, next);

        expect(ExternalLoginService.loginWithExternalProvider).toHaveBeenCalledWith(
          provider,
          "testuser",
          "password123",
          "203.0.113.10",
        );
        expect(LocalAuthService.loginWithLocalAccount).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(response);
        expect(AuditService.record).toHaveBeenCalledWith({
          action: AuditAction.LOGIN,
          userId: "internal-id-1",
          actorEmail: "test@example.com",
          metadata: { provider: "mi-proveedor" },
        });
        expect(next).not.toHaveBeenCalled();
      });

      describe("IP que se le reenvía al proveedor (config/client-ip.ts)", () => {
        const originalTrustCf = env.TRUST_CF_CONNECTING_IP;

        afterEach(() => {
          env.TRUST_CF_CONNECTING_IP = originalTrustCf;
        });

        async function loginWithCfHeader() {
          const req = createMockRequest({
            body: { user: "testuser", password: "password123" },
            ip: "10.0.0.1",
            headers: { "cf-connecting-ip": "198.51.100.77" },
          });
          await login(req, createMockResponse(), createMockNext());
        }

        it("con TRUST_CF_CONNECTING_IP, usa el header cf-connecting-ip", async () => {
          env.TRUST_CF_CONNECTING_IP = true;

          await loginWithCfHeader();

          expect(vi.mocked(ExternalLoginService.loginWithExternalProvider).mock.calls[0][3]).toBe("198.51.100.77");
        });

        it("sin TRUST_CF_CONNECTING_IP, ignora el header (cualquier cliente puede mandarlo) y usa req.ip", async () => {
          env.TRUST_CF_CONNECTING_IP = false;

          await loginWithCfHeader();

          expect(vi.mocked(ExternalLoginService.loginWithExternalProvider).mock.calls[0][3]).toBe("10.0.0.1");
        });
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
        expect(ExternalLoginService.loginWithExternalProvider).not.toHaveBeenCalled();
      });

      // El motivo de la auditoría sale del error que arma el login (external-login.service.ts).
      it.each([
        [
          "invalid_credentials",
          new UnauthorizedError("Usuario o contraseña incorrectos."),
        ],
        [
          "forbidden_by_provider",
          new ForbiddenError("No pudimos verificar tus credenciales."),
        ],
        [
          "account_disabled",
          new ForbiddenError("Tu cuenta está desactivada en este chat.", "account_disabled"),
        ],
        [
          "provider_unreachable",
          new ServiceUnavailableError("No pudimos conectar.", "provider_unreachable"),
        ],
        [
          "provider_error",
          new ServiceUnavailableError("No pudimos conectar.", "provider_error"),
        ],
        ["provider_error", new Error("algo inesperado")],
      ])("un fallo audita LOGIN_FAILED con el motivo %s, con la identidad intentada y sin la contraseña", async (reason, failure) => {
        vi.mocked(ExternalLoginService.loginWithExternalProvider).mockRejectedValue(failure);
        const req = createMockRequest({ body: { user: "testuser", password: "wrongpassword-SECRETA" } });
        const res = createMockResponse();
        const next = createMockNext();

        await login(req, res, next);

        expect(next).toHaveBeenCalledWith(failure);
        expect(res.json).not.toHaveBeenCalled();
        expect(AuditService.record).toHaveBeenCalledWith({
          action: AuditAction.LOGIN_FAILED,
          userId: null,
          actorEmail: "testuser",
          metadata: { provider: "mi-proveedor", reason },
        });
        expect(JSON.stringify(vi.mocked(AuditService.record).mock.calls)).not.toContain("wrongpassword-SECRETA");
      });
    });

    describe("con cuentas locales", () => {
      useLocalAuth();

      it("usa el login local, no el proveedor, y audita LOGIN con provider local", async () => {
        const response = { token: "local-token", user: { id: "user-1", mustChangePassword: false } };
        vi.mocked(LocalAuthService.loginWithLocalAccount).mockResolvedValue({
          record: { id: "user-1", email: "ana@example.com" },
          response,
        } as never);
        const req = createMockRequest({ body: { user: "ana@example.com", password: "secreta-123" } });
        const res = createMockResponse();

        await login(req, res, createMockNext());

        expect(ExternalLoginService.loginWithExternalProvider).not.toHaveBeenCalled();
        expect(LocalAuthService.loginWithLocalAccount).toHaveBeenCalledWith("ana@example.com", "secreta-123");
        expect(res.json).toHaveBeenCalledWith(response);
        expect(AuditService.record).toHaveBeenCalledWith({
          action: AuditAction.LOGIN,
          userId: "user-1",
          actorEmail: "ana@example.com",
          metadata: { provider: "local" },
        });
      });

      it("un fallo audita LOGIN_FAILED con el motivo real, sin la contraseña (invariante 9)", async () => {
        const failure = new LocalLoginError("Usuario, correo o contraseña incorrectos.", 401, "wrong_password");
        vi.mocked(LocalAuthService.loginWithLocalAccount).mockRejectedValue(failure);
        const req = createMockRequest({ body: { user: "ana@example.com", password: "secreta-123" } });
        const next = createMockNext();

        await login(req, createMockResponse(), next);

        expect(next).toHaveBeenCalledWith(failure);
        expect(AuditService.record).toHaveBeenCalledWith({
          action: AuditAction.LOGIN_FAILED,
          userId: null,
          actorEmail: "ana@example.com",
          metadata: { provider: "local", reason: "wrong_password" },
        });
        expect(JSON.stringify(vi.mocked(AuditService.record).mock.calls)).not.toContain("secreta-123");
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
