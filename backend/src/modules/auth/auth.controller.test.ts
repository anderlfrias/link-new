import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";

vi.mock("./auth.service", () => ({
  login: vi.fn(),
  upsertUsuario: vi.fn(),
  syncProfilePicture: vi.fn(),
  syncDirectoryThrottled: vi.fn(),
  getOwnProfilePictureUrl: vi.fn(),
  setProfilePicture: vi.fn(),
  removeProfilePicture: vi.fn(),
  updateOwnName: vi.fn(),
  updateNotificationSoundEnabled: vi.fn(),
  updatePreferences: vi.fn(),
}));

// Solo se reemplaza lo que depende de EXTERNAL_AUTH: `signSessionToken` es el real, así los tests
// verifican la sesión que LINK emite de verdad.
vi.mock("./jwt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./jwt")>()),
  mapTokenToUser: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getLocalAuthPolicy: vi.fn().mockResolvedValue({ sessionTtlHours: 12 }),
}));

vi.mock("../audit/audit.service");

vi.mock("./local-auth.service", () => ({
  loginWithLocalAccount: vi.fn(),
  changeOwnPassword: vi.fn(),
  getPublicAuthConfig: vi.fn(),
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
import * as LocalAuthService from "./local-auth.service";
import { LOCAL_AUTH_CONFIG, TEST_SESSION_JWT_SECRET, useAuthMode } from "../../test/auth-mode";
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
    it("responde con la sesión de LINK (no el token de EXTERNAL_AUTH) y el usuario mapeado, y audita LOGIN", async () => {
      const req = createMockRequest({
        body: { user: "testuser", password: "password123" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const providerToken = "external-auth-jwt-token";
      const mockPayload = { id: "ext-1", username: "testuser" } as any;
      const mockMapped = {
        id: "ext-1",
        email: "test@example.com",
        username: "testuser",
        fullName: "External Name",
        roles: ["user", "admin"],
        permissions: [],
        app: "chat-interno",
        exp: 123456,
        authProvider: "external-auth" as const,
      };
      const mockInternalUser = {
        id: "internal-id-1",
        name: "Local Name",
        avatarFileId: "avatar-1",
        notificationSoundEnabled: true,
        language: "es",
        syncProfileWithIntegration: true,
        status: "ACTIVE",
        email: "test@example.com",
        roles: ["admin"],
      } as any;

      vi.mocked(AuthService.login).mockResolvedValue(providerToken);
      vi.mocked(verifyToken).mockReturnValue(mockPayload);
      vi.mocked(mapTokenToUser).mockReturnValue(mockMapped);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue(mockInternalUser);

      await login(req, res, next);

      expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", undefined);
      expect(verifyToken).toHaveBeenCalledWith(providerToken);
      expect(mapTokenToUser).toHaveBeenCalledWith(mockPayload);
      // Los roles de EXTERNAL_AUTH que la app conoce se guardan en la cuenta; los demás se descartan.
      expect(AuthService.upsertUsuario).toHaveBeenCalledWith(mockMapped, ["admin"]);

      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN,
        userId: "internal-id-1",
        actorEmail: "test@example.com",
        metadata: { provider: "external-auth" },
      });

      const { token } = vi.mocked(res.json).mock.calls[0][0] as { token: string };
      expect(token).not.toBe(providerToken);
      const session = jwt.verify(token, TEST_SESSION_JWT_SECRET, { issuer: "link", audience: "link" }) as jwt.JwtPayload;
      expect(session).toMatchObject({ sub: "internal-id-1", email: "test@example.com" });
      expect(session.exp! - session.iat!).toBe(12 * 3600);
      expect(session).not.toHaveProperty("pcr");

      expect(res.json).toHaveBeenCalledWith({
        token,
        user: {
          ...mockMapped,
          // La sesión vence cuando vence su token, y los roles salen de la cuenta.
          exp: session.exp,
          roles: ["admin"],
          fullName: "Local Name",
          internalUserId: "internal-id-1",
          notificationSoundEnabled: true,
          language: "es",
          mustChangePassword: false,
          mustChangePasswordReason: null,
        },
      });

      // EXTERNAL_AUTH solo se usa en el login: la foto y el directorio se piden con SU token.
      expect(AuthService.syncProfilePicture).toHaveBeenCalledWith(
        "internal-id-1",
        "avatar-1",
        providerToken,
        true,
      );
      expect(AuthService.syncDirectoryThrottled).toHaveBeenCalledWith(providerToken);
      expect(next).not.toHaveBeenCalled();
    });

    it("responde el login sin esperar la sincronización del directorio", async () => {
      const req = createMockRequest({ body: { user: "testuser", password: "password123" } });
      const res = createMockResponse();
      const next = createMockNext();
      vi.mocked(AuthService.login).mockResolvedValue("mock-token");
      vi.mocked(verifyToken).mockReturnValue({ id: "ext-1", username: "testuser" } as any);
      vi.mocked(mapTokenToUser).mockReturnValue({ id: "ext-1", email: "test@example.com", username: "testuser", roles: [] } as any);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue({
        id: "int-1",
        name: "User",
        status: "ACTIVE",
        avatarFileId: null,
        syncProfileWithIntegration: true,
        notificationSoundEnabled: true,
        language: "es",
      } as any);
      // Una sincronización que nunca termina no puede colgar el login.
      vi.mocked(AuthService.syncDirectoryThrottled).mockReturnValue(new Promise(() => {}));

      await login(req, res, next);

      expect(res.json).toHaveBeenCalledTimes(1);
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
      vi.mocked(mapTokenToUser).mockReturnValue({ id: "ext-1", email: "test@example.com", username: "testuser", roles: [] } as any);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue({ id: "int-1", name: "User", status: "ACTIVE" } as any);

      await login(req, res, next);

      expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", "203.0.113.10");
    });

    describe("IP que se reenvía a EXTERNAL_AUTH (config/client-ip.ts)", () => {
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
        vi.mocked(AuthService.login).mockResolvedValue("mock-token");
        vi.mocked(verifyToken).mockReturnValue({ id: "ext-1", username: "testuser" } as any);
        vi.mocked(mapTokenToUser).mockReturnValue({ id: "ext-1", email: "test@example.com", username: "testuser", roles: [] } as any);
        vi.mocked(AuthService.upsertUsuario).mockResolvedValue({ id: "int-1", name: "User", status: "ACTIVE" } as any);
        await login(req, createMockResponse(), createMockNext());
      }

      it("con TRUST_CF_CONNECTING_IP, usa el header cf-connecting-ip", async () => {
        env.TRUST_CF_CONNECTING_IP = true;

        await loginWithCfHeader();

        expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", "198.51.100.77");
      });

      it("sin TRUST_CF_CONNECTING_IP, ignora el header (cualquier cliente puede mandarlo) y usa req.ip", async () => {
        env.TRUST_CF_CONNECTING_IP = false;

        await loginWithCfHeader();

        expect(AuthService.login).toHaveBeenCalledWith("testuser", "password123", "10.0.0.1");
      });
    });

    describe("modo local", () => {
      useAuthMode(LOCAL_AUTH_CONFIG);

      it("usa el login local, no EXTERNAL_AUTH, y audita LOGIN con provider local", async () => {
        const response = { token: "local-token", user: { id: "user-1", mustChangePassword: false } };
        vi.mocked(LocalAuthService.loginWithLocalAccount).mockResolvedValue({
          record: { id: "user-1", email: "ana@example.com" },
          response,
        } as any);
        const req = createMockRequest({ body: { user: "ana@example.com", password: "secreta-123" } });
        const res = createMockResponse();

        await login(req, res, createMockNext());

        expect(AuthService.login).not.toHaveBeenCalled();
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

    it("una cuenta desactivada en el chat no inicia sesión aunque EXTERNAL_AUTH acepte la contraseña (403 account_disabled)", async () => {
      const req = createMockRequest({ body: { user: "testuser", password: "password123" } });
      const res = createMockResponse();
      const next = createMockNext();
      vi.mocked(AuthService.login).mockResolvedValue("mock-token");
      vi.mocked(verifyToken).mockReturnValue({ id: "ext-1", username: "testuser" } as any);
      vi.mocked(mapTokenToUser).mockReturnValue({ id: "ext-1", email: "test@example.com", username: "testuser", roles: [] } as any);
      vi.mocked(AuthService.upsertUsuario).mockResolvedValue({ id: "int-1", name: "User", status: "INACTIVE" } as any);

      await login(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.code).toBe("account_disabled");
      expect(res.json).not.toHaveBeenCalled();
      expect(AuthService.syncProfilePicture).not.toHaveBeenCalled();
      // Sin sesión no hay sincronización del directorio.
      expect(AuthService.syncDirectoryThrottled).not.toHaveBeenCalled();
      expect(AuditService.record).toHaveBeenCalledWith({
        action: AuditAction.LOGIN_FAILED,
        userId: null,
        actorEmail: "testuser",
        metadata: { provider: "external-auth", reason: "account_disabled" },
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
        metadata: { provider: "external-auth", reason: "forbidden_by_provider" },
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
        metadata: { provider: "external-auth", reason: "invalid_credentials" },
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
        metadata: { provider: "external-auth", reason: "provider_unreachable" },
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
        metadata: { provider: "external-auth", reason: "provider_error" },
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
