import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { logger } from "../../config/logger";
import { runWithContext } from "../../config/request-context";
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findAvatarFileId: vi.fn(),
  setLocalAvatar: vi.fn(),
  setLocalName: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  updateAvatarFileId: vi.fn(),
  updateUserPreferences: vi.fn(),
  upsertUserFromExternalUser: vi.fn(),
}));

vi.mock("../files/file.service", () => ({
  storeAvatar: vi.fn(),
  getFileChecksum: vi.fn(),
}));

import {
  findAvatarFileId,
  setLocalAvatar,
  setLocalName,
  setNotificationSoundEnabled,
  updateAvatarFileId,
  updateUserPreferences,
  upsertUserFromExternalUser,
} from "./auth.repository";
import * as FileService from "../files/file.service";
import {
  getAppUsers,
  getOwnProfilePictureUrl,
  getProfilePicture,
  getProfilePictureByUsername,
  login,
  removeProfilePicture,
  setProfilePicture,
  DIRECTORY_SYNC_INTERVAL_MS,
  resetDirectorySyncThrottle,
  syncAppUsers,
  syncContactAvatar,
  syncDirectoryThrottled,
  syncProfilePicture,
  updateNotificationSoundEnabled,
  updateOwnName,
  updatePreferences,
  upsertUsuario,
} from "./auth.service";

// vitest.config.ts define las tres EXTERNAL_AUTH_*, así que estos tests corren en modo external-auth.
const external-auth = requireExternalUserConfig(env.auth);

describe("auth.service", () => {
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
    console.log = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  describe("login", () => {
    it("devuelve el token JWT si las credenciales son válidas", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, token: "valid-jwt-token" })),
        clone: () => ({ text: () => Promise.resolve('{"success":true}') }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const token = await login("validuser", "correctpassword");

      expect(token).toBe("valid-jwt-token");
      expect(fetch).toHaveBeenCalledWith(
        `${external-auth.apiUrl}/v1/login`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: "validuser",
            password: "correctpassword",
            app: external-auth.appCode,
          }),
        }),
      );
    });

    it("reenvía encabezados X-Forwarded-For y X-Real-IP a EXTERNAL_AUTH cuando clientIp es provisto", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, token: "token-with-ip" })),
        clone: () => ({ text: () => Promise.resolve('{"success":true}') }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const token = await login("validuser", "correctpassword", "203.0.113.195");

      expect(token).toBe("token-with-ip");
      expect(fetch).toHaveBeenCalledWith(
        `${external-auth.apiUrl}/v1/login`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "203.0.113.195",
            "X-Real-IP": "203.0.113.195",
          },
          body: JSON.stringify({
            user: "validuser",
            password: "correctpassword",
            app: external-auth.appCode,
          }),
        }),
      );
    });

    it("toma la IP del contexto de la petición si clientIp no se pasa como argumento", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, token: "token-context-ip" })),
        clone: () => ({ text: () => Promise.resolve('{"success":true}') }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      let token: string | undefined;
      await runWithContext(logger, { ip: "198.51.100.42" }, async () => {
        token = await login("validuser", "correctpassword");
      });

      expect(token).toBe("token-context-ip");
      expect(fetch).toHaveBeenCalledWith(
        `${external-auth.apiUrl}/v1/login`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "198.51.100.42",
            "X-Real-IP": "198.51.100.42",
          },
        }),
      );
    });

    it("login exitoso con token centinela nunca loguea el token ni en mensaje ni en metadata", async () => {
      const SENTINEL_TOKEN = "SENTINEL_TOKEN_VALUE_SECRET_XYZ";
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, token: SENTINEL_TOKEN })),
        clone: () => ({ text: () => Promise.resolve(JSON.stringify({ success: true, token: SENTINEL_TOKEN })) }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const debugSpy = vi.spyOn(logger, "debug");
      const infoSpy = vi.spyOn(logger, "info");
      const warnSpy = vi.spyOn(logger, "warn");
      const errorSpy = vi.spyOn(logger, "error");

      const token = await login("validuser", "correctpassword");
      expect(token).toBe(SENTINEL_TOKEN);

      const allCalls = [
        ...debugSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ];
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain(SENTINEL_TOKEN);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
        "external-auth login responded",
      );
    });

    it("login fallido (403) tampoco expone el body en ningún log", async () => {
      const SENTINEL_BODY = "SENTINEL_FORBIDDEN_BODY_CONTENT";
      const mockResponse = {
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ error: SENTINEL_BODY })),
        clone: () => ({ text: () => Promise.resolve(JSON.stringify({ error: SENTINEL_BODY })) }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const debugSpy = vi.spyOn(logger, "debug");
      const infoSpy = vi.spyOn(logger, "info");
      const warnSpy = vi.spyOn(logger, "warn");
      const errorSpy = vi.spyOn(logger, "error");

      await expect(login("user", "wrongpass")).rejects.toThrow(ForbiddenError);

      const allCalls = [
        ...debugSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ];
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain(SENTINEL_BODY);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
        "external-auth login responded",
      );
    });

    it("lanza ForbiddenError genérico si EXTERNAL_AUTH responde con status 403 (invariante de negocio)", async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ error: "Access denied or bad credentials" })),
        clone: () => ({ text: () => Promise.resolve('{"error":"..."}') }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      await expect(login("user", "wrongpass")).rejects.toThrow(ForbiddenError);
      await expect(login("user", "wrongpass")).rejects.toThrow(
        "No pudimos verificar tus credenciales. Revisá tu usuario y contraseña. Si el problema persiste, contactá a un administrador.",
      );
    });

    it("lanza ForbiddenError genérico si data.error contiene 'forbidden' independientemente del status", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ error: "User is forbidden" })),
        clone: () => ({ text: () => Promise.resolve('{"error":"User is forbidden"}') }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      await expect(login("user", "pass")).rejects.toThrow(ForbiddenError);
    });

    it("lanza UnauthorizedError si EXTERNAL_AUTH responde 401", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: "Credenciales inválidas" })),
        clone: () => ({ text: () => Promise.resolve("") }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      await expect(login("user", "pass")).rejects.toThrow(UnauthorizedError);
      await expect(login("user", "pass")).rejects.toThrow("Credenciales inválidas");
    });

    it("lanza ServiceUnavailableError si fetch falla por caída de red o timeout", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network connection failed")));

      await expect(login("user", "pass")).rejects.toThrow(ServiceUnavailableError);
      await expect(login("user", "pass")).rejects.toThrow(
        "No pudimos conectar con el servicio de autenticación. Intentá de nuevo en unos minutos.",
      );
    });

    it("maneja body no-JSON sin explotar y resuelve según el status HTTP", async () => {
      // Caso 1: Status 403 con HTML no-JSON -> lanza ForbiddenError genérico
      const html403Response = {
        ok: false,
        status: 403,
        text: () => Promise.resolve("<html><body>Forbidden</body></html>"),
        clone: () => ({ text: () => Promise.resolve("<html><body>Forbidden</body></html>") }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html403Response));

      await expect(login("user", "pass")).rejects.toThrow(ForbiddenError);

      // Caso 2: Status 502 con texto plano -> lanza ServiceUnavailableError
      const html502Response = {
        ok: false,
        status: 502,
        text: () => Promise.resolve("Bad Gateway"),
        clone: () => ({ text: () => Promise.resolve("Bad Gateway") }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html502Response));

      await expect(login("user", "pass")).rejects.toThrow(ServiceUnavailableError);
    });

    it("lanza UnauthorizedError si responde 200 pero success es false o falta token", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: false })),
        clone: () => ({ text: () => Promise.resolve("") }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      await expect(login("user", "pass")).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("upsertUsuario", () => {
    it("delega la llamada a upsertUserFromExternalUser del repositorio", async () => {
      const mappedUser = { id: "1", email: "a@b.com", username: "u", fullName: "User" } as any;
      const expectedUser = { id: "internal-1" } as any;
      vi.mocked(upsertUserFromExternalUser).mockResolvedValue(expectedUser);

      const result = await upsertUsuario(mappedUser);

      expect(upsertUserFromExternalUser).toHaveBeenCalledWith(mappedUser);
      expect(result).toBe(expectedUser);
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
      await expect(getOwnProfilePictureUrl("user-without-avatar")).rejects.toThrow(
        "Profile picture not found",
      );
    });
  });

  describe("setProfilePicture", () => {
    it("guarda el avatar mediante FileService y actualiza el usuario localmente", async () => {
      const buffer = Buffer.from("image-content");
      const storedFile = { id: "stored-1", path: "avatars/stored-1.png" } as any;
      vi.mocked(FileService.storeAvatar).mockResolvedValue(storedFile);

      const result = await setProfilePicture("u-1", buffer, "image/png");

      expect(FileService.storeAvatar).toHaveBeenCalledWith("u-1", buffer, "image/png");
      expect(setLocalAvatar).toHaveBeenCalledWith("u-1", "stored-1");
      expect(result).toBe(storedFile);
    });
  });

  describe("removeProfilePicture", () => {
    it("elimina el avatar asignando null en setLocalAvatar", async () => {
      const mockUser = { id: "u-1", avatarFileId: null } as any;
      vi.mocked(setLocalAvatar).mockResolvedValue(mockUser);

      const result = await removeProfilePicture("u-1");

      expect(setLocalAvatar).toHaveBeenCalledWith("u-1", null);
      expect(result).toBe(mockUser);
    });
  });

  describe("updateOwnName", () => {
    it("llama a setLocalName en el repositorio", async () => {
      const mockUser = { id: "u-1", name: "Nuevo" } as any;
      vi.mocked(setLocalName).mockResolvedValue(mockUser);

      const result = await updateOwnName("u-1", "Nuevo");

      expect(setLocalName).toHaveBeenCalledWith("u-1", "Nuevo");
      expect(result).toBe(mockUser);
    });
  });

  describe("updateNotificationSoundEnabled", () => {
    it("llama a updateUserPreferences a través de updatePreferences", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: true } as any;
      vi.mocked(updateUserPreferences).mockResolvedValue(mockUser);

      const result = await updateNotificationSoundEnabled("u-1", true);

      expect(updateUserPreferences).toHaveBeenCalledWith("u-1", { notificationSoundEnabled: true });
      expect(result).toBe(mockUser);
    });
  });

  describe("updatePreferences", () => {
    it("delega a updateUserPreferences en el repositorio con notificationSoundEnabled y language", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: false, language: "en" } as any;
      vi.mocked(updateUserPreferences).mockResolvedValue(mockUser);

      const result = await updatePreferences("u-1", { notificationSoundEnabled: false, language: "en" });

      expect(updateUserPreferences).toHaveBeenCalledWith("u-1", {
        notificationSoundEnabled: false,
        language: "en",
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("getAppUsers", () => {
    it("obtiene y parsea usuarios en formato de array directo", async () => {
      const mockUsers = [
        { id: "ext-1", email: "u1@test.com", username: "u1", fullName: "User One" },
        { id: "ext-2", email: "u2@test.com", username: "u2", name: "User", firstSurname: "Two" },
      ];
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockUsers)),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await getAppUsers("test-token");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "ext-1",
        email: "u1@test.com",
        username: "u1",
        fullName: "User One",
      });
      expect(result[1]).toEqual({
        id: "ext-2",
        email: "u2@test.com",
        username: "u2",
        fullName: "User Two",
      });
    });

    it("soporta respuestas envueltas en { data: [...] } o { users: [...] }", async () => {
      const mockWrapped = {
        data: [{ id: "ext-1", email: "u1@test.com", username: "u1", fullName: "User One" }],
      };
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockWrapped)),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await getAppUsers("test-token");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ext-1");
    });

    it("descarta entradas mal formadas sin romper el resultado general y loguea warn", async () => {
      const warnSpy = vi.spyOn(logger, "warn");
      const mockMixed = [
        { id: "ext-1", email: "u1@test.com", username: "u1", fullName: "User One" },
        { id: "ext-broken" }, // Faltan email y username
      ];
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockMixed)),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await getAppUsers("test-token");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ext-1");
      expect(warnSpy).toHaveBeenCalledWith("skipping malformed external-auth app user entry");
    });

    it("lanza ServiceUnavailableError y loguea error si la respuesta de EXTERNAL_AUTH no es OK o falla la red", async () => {
      const errorSpy = vi.spyOn(logger, "error");

      // 1) Status no-ok (500)
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("") }));
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
        "external-auth app users returned unexpected status",
      );

      // 2) Falla de red
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failed")));
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "external-auth app users request failed",
      );

      // 3) JSON inválido
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("invalid-json{") }));
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);
      expect(errorSpy).toHaveBeenCalledWith("external-auth app users response is not valid json");

      // 4) Shape inesperado
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ unexpected: 123 })) }));
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);
      expect(errorSpy).toHaveBeenCalledWith("external-auth app users response has an unexpected shape");
    });
  });

  describe("getProfilePicture / getProfilePictureByUsername (fetchExternalUserProfilePicture)", () => {
    it("devuelve buffer y contentType parseando el data URI de EXTERNAL_AUTH", async () => {
      const buffer = Buffer.from("contenido-jpeg");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(`data:image/jpeg;base64,${buffer.toString("base64")}`),
        }),
      );

      const result = await getProfilePicture("token-abc");

      expect(result.contentType).toBe("image/jpeg");
      expect(result.buffer).toEqual(buffer);
      expect(fetch).toHaveBeenCalledWith(
        `${external-auth.apiUrl}/v1/profile/picture`,
        expect.objectContaining({ headers: { Authorization: "token-abc" } }),
      );
    });

    it("nunca manda el prefijo 'Bearer ' en el header Authorization (EXTERNAL_AUTH decodifica el header tal cual)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("data:image/png;base64,abc") }),
      );

      await getProfilePicture("raw-token-sin-bearer");

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: "raw-token-sin-bearer" } }),
      );
    });

    it("getProfilePictureByUsername pega a la URL con el username, para traer la foto de un tercero", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("data:image/png;base64,abc") }),
      );

      await getProfilePictureByUsername("token-abc", "juan.perez");

      expect(fetch).toHaveBeenCalledWith(
        `${external-auth.apiUrl}/v1/profile/picture/juan.perez`,
        expect.anything(),
      );
    });

    it("parsea el data URI cuando viene envuelto en comillas de JSON", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('"data:image/png;base64,iVBORw0KGgo="') }),
      );

      const result = await getProfilePicture("token");
      expect(result.contentType).toBe("image/png");
    });

    it("lanza NotFoundError si EXTERNAL_AUTH responde con code USER_NOT_FOUND o PROFILE_PICTURE_NOT_FOUND", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve(JSON.stringify({ code: "USER_NOT_FOUND" })),
        }),
      );
      await expect(getProfilePicture("token")).rejects.toThrow(NotFoundError);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve(JSON.stringify({ code: "PROFILE_PICTURE_NOT_FOUND" })),
        }),
      );
      await expect(getProfilePictureByUsername("token", "juan")).rejects.toThrow(NotFoundError);
    });

    it("lanza ServiceUnavailableError ante cualquier otro status de error, cuerpo no-data-URI, o fetch caído", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("") }),
      );
      await expect(getProfilePicture("token")).rejects.toThrow(ServiceUnavailableError);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("no-es-un-data-uri") }),
      );
      await expect(getProfilePicture("token")).rejects.toThrow(ServiceUnavailableError);

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
      await expect(getProfilePicture("token")).rejects.toThrow(ServiceUnavailableError);
    });
  });

  describe("syncProfilePicture / syncContactAvatar (syncAvatar) — nunca lanza, fire-and-forget", () => {
    it("no pega a EXTERNAL_AUTH si enabled es false", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      await syncProfilePicture("u-1", null, "token", false);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(updateAvatarFileId).not.toHaveBeenCalled();
    });

    it("cachea el avatar si el checksum de lo recién bajado difiere del ya guardado", async () => {
      const buffer = Buffer.from("nueva-imagen");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(`data:image/png;base64,${buffer.toString("base64")}`),
        }),
      );
      vi.mocked(FileService.getFileChecksum).mockResolvedValue("checksum-completamente-distinto");
      vi.mocked(FileService.storeAvatar).mockResolvedValue({ id: "stored-new" } as any);

      await syncProfilePicture("u-1", "old-avatar-file-id", "token", true);

      expect(FileService.getFileChecksum).toHaveBeenCalledWith("old-avatar-file-id");
      expect(FileService.storeAvatar).toHaveBeenCalledWith("u-1", buffer, "image/png");
      expect(updateAvatarFileId).toHaveBeenCalledWith("u-1", "stored-new");
    });

    it("NO recachea si el checksum coincide con el ya guardado (evita reescribir sin cambios)", async () => {
      const buffer = Buffer.from("misma-imagen-de-siempre");
      const checksum = createHash("sha256").update(buffer).digest("hex");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(`data:image/png;base64,${buffer.toString("base64")}`),
        }),
      );
      vi.mocked(FileService.getFileChecksum).mockResolvedValue(checksum);

      await syncProfilePicture("u-1", "current-avatar-file-id", "token", true);

      expect(FileService.storeAvatar).not.toHaveBeenCalled();
      expect(updateAvatarFileId).not.toHaveBeenCalled();
    });

    it("si no había avatar cacheado antes, cachea directo sin comparar checksum", async () => {
      const buffer = Buffer.from("primera-foto");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(`data:image/png;base64,${buffer.toString("base64")}`),
        }),
      );
      vi.mocked(FileService.storeAvatar).mockResolvedValue({ id: "stored-1" } as any);

      await syncProfilePicture("u-1", null, "token", true);

      expect(FileService.getFileChecksum).not.toHaveBeenCalled();
      expect(FileService.storeAvatar).toHaveBeenCalled();
    });

    it("limpia avatarFileId si EXTERNAL_AUTH ya no tiene foto (404) y había una cacheada", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve(JSON.stringify({ code: "PROFILE_PICTURE_NOT_FOUND" })),
        }),
      );

      await syncProfilePicture("u-1", "old-avatar-file-id", "token", true);

      expect(updateAvatarFileId).toHaveBeenCalledWith("u-1", null);
    });

    it("no hace nada si EXTERNAL_AUTH no tiene foto y tampoco había una cacheada antes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve(JSON.stringify({ code: "PROFILE_PICTURE_NOT_FOUND" })),
        }),
      );

      await syncProfilePicture("u-1", null, "token", true);

      expect(updateAvatarFileId).not.toHaveBeenCalled();
    });

    it("nunca lanza (fire-and-forget) aunque EXTERNAL_AUTH falle con un error no-404", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("EXTERNAL_AUTH caído")));

      await expect(syncProfilePicture("u-1", null, "token", true)).resolves.toBeUndefined();
    });

    it("syncContactAvatar usa getProfilePictureByUsername (no el propio token del actor)", async () => {
      const buffer = Buffer.from("foto-de-un-contacto");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(`data:image/png;base64,${buffer.toString("base64")}`),
        }),
      );
      vi.mocked(FileService.storeAvatar).mockResolvedValue({ id: "stored-contact" } as any);

      await syncContactAvatar("u-1", null, "juan.perez", "token");

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v1/profile/picture/juan.perez"), expect.anything());
      expect(FileService.storeAvatar).toHaveBeenCalled();
    });
  });

  describe("syncAppUsers — nunca rompe el directorio completo por un fallo puntual", () => {
    it("hace fallback silencioso al directorio local si getAppUsers falla y loguea error", async () => {
      const errorSpy = vi.spyOn(logger, "error");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("EXTERNAL_AUTH caído")));

      // false: no se pudo traer el directorio (el throttle usa esto para reintentar).
      await expect(syncAppUsers("token")).resolves.toBe(false);
      expect(upsertUserFromExternalUser).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "failed to sync app users from external-auth",
      );
    });

    it("upsertea cada usuario devuelto por EXTERNAL_AUTH y sincroniza su avatar si no tiene uno cacheado", async () => {
      const mockUsers = [{ id: "ext-1", email: "a@b.com", username: "juan", fullName: "Juan Perez" }];
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(mockUsers)) })
          .mockResolvedValueOnce({
            ok: false,
            status: 404,
            text: () => Promise.resolve(JSON.stringify({ code: "PROFILE_PICTURE_NOT_FOUND" })),
          }),
      );
      vi.mocked(upsertUserFromExternalUser).mockResolvedValue({
        id: "internal-1",
        avatarFileId: null,
        syncProfileWithIntegration: true,
      } as any);

      await syncAppUsers("token");

      expect(upsertUserFromExternalUser).toHaveBeenCalledWith(mockUsers[0]);
      expect(fetch).toHaveBeenCalledTimes(2); // 1) directorio, 2) intento de foto del contacto
    });

    it("no intenta sincronizar avatar si el usuario ya tiene uno cacheado", async () => {
      const mockUsers = [{ id: "ext-1", email: "a@b.com", username: "juan", fullName: "Juan Perez" }];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(mockUsers)) }),
      );
      vi.mocked(upsertUserFromExternalUser).mockResolvedValue({
        id: "internal-1",
        avatarFileId: "existing-avatar",
        syncProfileWithIntegration: true,
      } as any);

      await syncAppUsers("token");

      expect(fetch).toHaveBeenCalledTimes(1); // solo la llamada del directorio, sin segunda llamada de foto
    });

    it("no rompe el sync completo si un usuario puntual falla al upsertear y loguea error", async () => {
      const errorSpy = vi.spyOn(logger, "error");
      const mockUsers = [
        { id: "ext-1", email: "a@b.com", username: "juan", fullName: "Juan Perez" },
        { id: "ext-2", email: "c@d.com", username: "maria", fullName: "Maria Lopez" },
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(mockUsers)) }),
      );
      vi.mocked(upsertUserFromExternalUser)
        .mockRejectedValueOnce(new Error("DB error para juan"))
        .mockResolvedValueOnce({ id: "internal-2", avatarFileId: "x", syncProfileWithIntegration: false } as any);

      // Un usuario puntual que falla no cuenta: el directorio sí se pudo traer.
      await expect(syncAppUsers("token")).resolves.toBe(true);
      expect(upsertUserFromExternalUser).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), username: "juan" }),
        "failed to sync contact from external-auth",
      );
    });
  });

  describe("syncDirectoryThrottled — el directorio se sincroniza al iniciar sesión, con throttle", () => {
    const directory = [{ id: "ext-1", email: "a@b.com", username: "juan", fullName: "Juan Perez" }];
    const directoryResponse = () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(directory)),
    });

    beforeEach(() => {
      resetDirectorySyncThrottle();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
      vi.mocked(upsertUserFromExternalUser).mockResolvedValue({
        id: "internal-1",
        avatarFileId: "existing-avatar",
        syncProfileWithIntegration: true,
      } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sincroniza el directorio con el token del login", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directoryResponse()));

      await syncDirectoryThrottled("token-del-login");

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][1]).toEqual(
        expect.objectContaining({ headers: { Authorization: "token-del-login" } }),
      );
      expect(upsertUserFromExternalUser).toHaveBeenCalledWith(directory[0]);
    });

    it("no vuelve a sincronizar dentro de la ventana, aunque inicie sesión otra persona", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directoryResponse()));

      await syncDirectoryThrottled("token-ana");
      vi.setSystemTime(Date.now() + DIRECTORY_SYNC_INTERVAL_MS - 1);
      await syncDirectoryThrottled("token-beto");

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("sincroniza de nuevo pasada la ventana", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directoryResponse()));

      await syncDirectoryThrottled("token-ana");
      vi.setSystemTime(Date.now() + DIRECTORY_SYNC_INTERVAL_MS);
      await syncDirectoryThrottled("token-beto");

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("si no se pudo traer el directorio, no consume la ventana y el próximo login reintenta", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new Error("EXTERNAL_AUTH caído")).mockResolvedValue(directoryResponse()),
      );

      await syncDirectoryThrottled("token-ana");
      await syncDirectoryThrottled("token-beto");

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(upsertUserFromExternalUser).toHaveBeenCalledTimes(1);
    });

    it("logins simultáneos no disparan sincronizaciones en paralelo", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directoryResponse()));

      await Promise.all([syncDirectoryThrottled("token-1"), syncDirectoryThrottled("token-2")]);

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("nunca lanza, aunque falle algo inesperado", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

      await expect(syncDirectoryThrottled("token")).resolves.toBeUndefined();
    });
  });

  // Sin EXTERNAL_AUTH_* en el .env la instalación está en modo local: ningún camino
  // de este servicio debe llegar a llamar a EXTERNAL_AUTH (con una URL "undefined").
  describe("en modo local (EXTERNAL_AUTH sin configurar)", () => {
    const originalAuth = env.auth;

    beforeEach(() => {
      env.auth = { mode: "local", local: { jwtSecret: "l".repeat(32) } };
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      env.auth = originalAuth;
    });

    it("login rechaza con ServiceUnavailableError sin llamar a EXTERNAL_AUTH", async () => {
      await expect(login("validuser", "correctpassword")).rejects.toThrow(ServiceUnavailableError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("getAppUsers y las fotos rechazan sin llamar a EXTERNAL_AUTH", async () => {
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);
      await expect(getProfilePicture("token")).rejects.toThrow(ServiceUnavailableError);
      await expect(getProfilePictureByUsername("token", "juan.perez")).rejects.toThrow(ServiceUnavailableError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("syncAppUsers no rompe (sigue siendo fail-soft) y no llama a EXTERNAL_AUTH", async () => {
      await expect(syncAppUsers("token")).resolves.toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(upsertUserFromExternalUser).not.toHaveBeenCalled();
    });
  });
});
