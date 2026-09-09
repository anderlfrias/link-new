import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import env from "../../config/env";
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findAvatarPath: vi.fn(),
  setLocalAvatar: vi.fn(),
  setLocalName: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  updateAvatarFileId: vi.fn(),
  upsertUserFromExternalUser: vi.fn(),
}));

vi.mock("../files/file.service", () => ({
  storeAvatar: vi.fn(),
  getFileChecksum: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storage: {
    getPublicUrl: vi.fn((p: string) => `/uploads/${p}`),
  },
}));

import {
  findAvatarPath,
  setLocalAvatar,
  setLocalName,
  setNotificationSoundEnabled,
  upsertUserFromExternalUser,
} from "./auth.repository";
import * as FileService from "../files/file.service";
import {
  getAppUsers,
  getOwnProfilePictureUrl,
  login,
  removeProfilePicture,
  setProfilePicture,
  updateNotificationSoundEnabled,
  updateOwnName,
  upsertUsuario,
} from "./auth.service";

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
        `${env.EXTERNAL_AUTH_API_URL}/v1/login`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: "validuser",
            password: "correctpassword",
            app: env.APP_CODE_EXTERNAL_AUTH,
          }),
        }),
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
    it("devuelve la URL pública si el path del avatar existe", async () => {
      vi.mocked(findAvatarPath).mockResolvedValue("avatars/user-1.jpg");

      const url = await getOwnProfilePictureUrl("user-1");

      expect(findAvatarPath).toHaveBeenCalledWith("user-1");
      expect(url).toBe("/uploads/avatars/user-1.jpg");
    });

    it("lanza NotFoundError si el usuario no tiene avatar cacheado", async () => {
      vi.mocked(findAvatarPath).mockResolvedValue(null);

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
    it("llama a setNotificationSoundEnabled en el repositorio", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: true } as any;
      vi.mocked(setNotificationSoundEnabled).mockResolvedValue(mockUser);

      const result = await updateNotificationSoundEnabled("u-1", true);

      expect(setNotificationSoundEnabled).toHaveBeenCalledWith("u-1", true);
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

    it("descarta entradas mal formadas sin romper el resultado general", async () => {
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
    });

    it("lanza ServiceUnavailableError si la respuesta de EXTERNAL_AUTH no es OK o falla la red", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("") }));
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failed")));
      await expect(getAppUsers("token")).rejects.toThrow(ServiceUnavailableError);
    });
  });
});
