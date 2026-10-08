import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProviderError, AuthProviderErrorReason } from "../../auth-providers/api";
import { createFakeProvider, TEST_SESSION_JWT_SECRET } from "../../test/auth-mode";
import { ForbiddenError, ServiceUnavailableError, UnauthorizedError } from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  upsertExternalUser: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getLocalAuthPolicy: vi.fn().mockResolvedValue({ sessionTtlHours: 12 }),
}));

vi.mock("../../auth-providers/context", () => ({
  createProviderContext: vi.fn(),
}));

vi.mock("../../config/request-context", () => ({
  getLogger: vi.fn(),
}));

import { createProviderContext } from "../../auth-providers/context";
import { getLogger } from "../../config/request-context";
import { upsertExternalUser } from "./auth.repository";
import { AUTHENTICATE_TIMEOUT_MS, loginWithExternalProvider } from "./external-login.service";

const IDENTITY = {
  externalId: "ext-1",
  email: "ana@example.com",
  username: "ana",
  fullName: "Ana Gómez",
  roles: ["admin", "rol-desconocido"],
};

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "ana@example.com",
    name: "Ana Gómez",
    username: "ana",
    roles: ["admin"],
    status: "ACTIVE",
    notificationSoundEnabled: true,
    language: "es",
    syncProfileWithIntegration: true,
    ...overrides,
  } as never;
}

const ctx = { logger: {}, users: {} } as never;
let logger: { debug: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  logger = { debug: vi.fn(), error: vi.fn() };
  vi.mocked(getLogger).mockReturnValue(logger as never);
  vi.mocked(createProviderContext).mockReturnValue(ctx);
  vi.mocked(upsertExternalUser).mockResolvedValue(account());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loginWithExternalProvider", () => {
  it("valida con el proveedor, guarda la cuenta y devuelve la sesión de LINK, no el token del proveedor", async () => {
    const authenticate = vi.fn().mockResolvedValue({ ...IDENTITY, providerData: { token: "token-del-proveedor" } });
    const provider = createFakeProvider({ id: "mi-proveedor", authenticate });

    const { record, response } = await loginWithExternalProvider(provider, "ana", "secreta", "203.0.113.5");

    expect(createProviderContext).toHaveBeenCalledWith("mi-proveedor");
    expect(authenticate).toHaveBeenCalledWith({ login: "ana", password: "secreta", clientIp: "203.0.113.5" }, ctx);
    expect(record.id).toBe("user-1");

    const session = jwt.verify(response.token, TEST_SESSION_JWT_SECRET, { issuer: "link", audience: "link" }) as jwt.JwtPayload;
    expect(session).toMatchObject({ sub: "user-1", email: "ana@example.com" });
    expect(session.exp! - session.iat!).toBe(12 * 3600);
    expect(session).not.toHaveProperty("pcr");
    expect(response.user).toMatchObject({
      id: "user-1",
      internalUserId: "user-1",
      email: "ana@example.com",
      fullName: "Ana Gómez",
      roles: ["admin"],
      authProvider: "mi-proveedor",
      exp: session.exp,
      mustChangePassword: false,
      mustChangePasswordReason: null,
    });
    // Nada del proveedor llega al cliente.
    expect(JSON.stringify(response)).not.toContain("token-del-proveedor");
  });

  it("guarda la cuenta con el id del proveedor y solo los roles que LINK conoce", async () => {
    const provider = createFakeProvider({ id: "mi-proveedor", authenticate: vi.fn().mockResolvedValue(IDENTITY) });

    await loginWithExternalProvider(provider, "ana", "secreta");

    expect(upsertExternalUser).toHaveBeenCalledWith(
      "mi-proveedor",
      { externalId: "ext-1", email: "ana@example.com", username: "ana", fullName: "Ana Gómez" },
      { roles: ["admin"] },
    );
  });

  it("un proveedor sin roles deja la cuenta sin ninguno (se sobrescriben en cada login)", async () => {
    const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue({ ...IDENTITY, roles: [] }) });

    await loginWithExternalProvider(provider, "ana", "secreta");

    expect(vi.mocked(upsertExternalUser).mock.calls[0][2]).toEqual({ roles: [] });
  });

  it.each([
    [undefined, undefined],
    [null, null],
    ["  ana  ", "ana"],
    ["   ", null],
  ])("username %j del proveedor -> %j al guardar (si no lo informa, se conserva el que había)", async (given, saved) => {
    const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue({ ...IDENTITY, username: given }) });

    await loginWithExternalProvider(provider, "ana", "secreta");

    expect(vi.mocked(upsertExternalUser).mock.calls[0][1].username).toBe(saved);
  });

  describe("errores del proveedor: LINK responde con sus propios textos", () => {
    const cases: Array<[AuthProviderErrorReason, new (...args: never[]) => Error, number, string | undefined]> = [
      ["invalid_credentials", UnauthorizedError, 401, undefined],
      ["access_denied", ForbiddenError, 403, undefined],
      ["provider_unavailable", ServiceUnavailableError, 503, "provider_unreachable"],
      ["provider_error", ServiceUnavailableError, 503, "provider_error"],
    ];

    it.each(cases)("%s -> %p con status %i y code %s", async (reason, errorClass, statusCode, code) => {
      const provider = createFakeProvider({
        authenticate: vi.fn().mockRejectedValue(new AuthProviderError(reason, "detalle interno del proveedor SECRETO")),
      });

      const error = await loginWithExternalProvider(provider, "ana", "mala").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(errorClass);
      expect(error).toMatchObject({ statusCode, code });
      // El texto que ve la persona es el de LINK; el del proveedor, solo para diagnóstico.
      expect((error as Error).message).not.toContain("SECRETO");
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ reason, detail: "detalle interno del proveedor SECRETO" }),
        "auth provider rejected login",
      );
      expect(upsertExternalUser).not.toHaveBeenCalled();
    });

    it("reconoce el AuthProviderError de la copia de api.ts que trae un proveedor de otro repositorio", async () => {
      class AuthProviderError extends Error {
        reason = "invalid_credentials";
        constructor() {
          super("otra copia");
          this.name = "AuthProviderError";
        }
      }
      const provider = createFakeProvider({ authenticate: vi.fn().mockRejectedValue(new AuthProviderError()) });

      await expect(loginWithExternalProvider(provider, "ana", "mala")).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("cualquier otro error es un provider_error (503) y se loguea sin mostrarlo", async () => {
      const boom = new TypeError("Cannot read properties of undefined");
      const provider = createFakeProvider({ authenticate: vi.fn().mockRejectedValue(boom) });

      const error = await loginWithExternalProvider(provider, "ana", "secreta").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect(error).toMatchObject({ code: "provider_error" });
      expect((error as Error).message).not.toContain("undefined");
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: boom, provider: "external-test" }), "auth provider failed");
    });

    it("un authenticate que lanza de forma síncrona también es un provider_error", async () => {
      const provider = createFakeProvider({
        authenticate: vi.fn(() => {
          throw new Error("sync boom");
        }),
      });

      await expect(loginWithExternalProvider(provider, "ana", "secreta")).rejects.toMatchObject({ code: "provider_error" });
    });

    it("un proveedor que no responde corta a los 10 s como provider_unreachable", async () => {
      vi.useFakeTimers();
      const provider = createFakeProvider({ authenticate: vi.fn(() => new Promise<never>(() => {})) });

      const result = loginWithExternalProvider(provider, "ana", "secreta").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(AUTHENTICATE_TIMEOUT_MS);

      expect(await result).toMatchObject({ statusCode: 503, code: "provider_unreachable" });
    });

    it("un proveedor que responde a tiempo no deja el timer colgado", async () => {
      vi.useFakeTimers();
      const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue(IDENTITY) });

      await loginWithExternalProvider(provider, "ana", "secreta");

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("identidad que devuelve el proveedor (código de terceros: no se confía)", () => {
    it.each([
      ["sin externalId", { ...IDENTITY, externalId: "" }],
      ["sin correo", { ...IDENTITY, email: "" }],
      ["con el correo de otro tipo", { ...IDENTITY, email: 42 }],
      ["sin nombre", { ...IDENTITY, fullName: undefined }],
      ["con los roles que no son una lista", { ...IDENTITY, roles: "admin" }],
      ["null", null],
    ])("%s -> provider_error, y no se guarda nada", async (_label, identity) => {
      const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue(identity) });

      await expect(loginWithExternalProvider(provider, "ana", "secreta")).rejects.toMatchObject({
        statusCode: 503,
        code: "provider_error",
      });
      expect(upsertExternalUser).not.toHaveBeenCalled();
    });

    it("descarta los roles que no son texto", async () => {
      const provider = createFakeProvider({
        authenticate: vi.fn().mockResolvedValue({ ...IDENTITY, roles: ["admin", 7, null] }),
      });

      await loginWithExternalProvider(provider, "ana", "secreta");

      expect(vi.mocked(upsertExternalUser).mock.calls[0][2]).toEqual({ roles: ["admin"] });
    });
  });

  it("una cuenta desactivada en LINK no inicia sesión aunque el proveedor acepte la contraseña (403 account_disabled)", async () => {
    vi.mocked(upsertExternalUser).mockResolvedValue(account({ status: "INACTIVE" }));
    const onLogin = vi.fn();
    const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue(IDENTITY), onLogin });

    const error = await loginWithExternalProvider(provider, "ana", "secreta").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({ code: "account_disabled" });
    // Sin sesión no hay sincronización en segundo plano.
    expect(onLogin).not.toHaveBeenCalled();
  });

  describe("onLogin — en segundo plano", () => {
    it("recibe el evento con la cuenta, la identidad (con los roles ya filtrados) y lo que el proveedor pasó", async () => {
      const onLogin = vi.fn().mockResolvedValue(undefined);
      const providerData = { token: "token-del-proveedor" };
      const provider = createFakeProvider({
        authenticate: vi.fn().mockResolvedValue({ ...IDENTITY, providerData }),
        onLogin,
      });

      await loginWithExternalProvider(provider, "ana", "secreta");
      await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));

      expect(onLogin).toHaveBeenCalledWith(
        {
          userId: "user-1",
          identity: { externalId: "ext-1", email: "ana@example.com", username: "ana", fullName: "Ana Gómez", roles: ["admin"] },
          providerData,
          syncProfileWithIntegration: true,
        },
        ctx,
      );
    });

    it("le avisa si la persona ya editó su perfil en LINK (syncProfileWithIntegration false)", async () => {
      vi.mocked(upsertExternalUser).mockResolvedValue(account({ syncProfileWithIntegration: false }));
      const onLogin = vi.fn().mockResolvedValue(undefined);
      const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue(IDENTITY), onLogin });

      await loginWithExternalProvider(provider, "ana", "secreta");
      await vi.waitFor(() => expect(onLogin).toHaveBeenCalled());

      expect(onLogin.mock.calls[0][0]).toMatchObject({ syncProfileWithIntegration: false });
    });

    it("no demora el login: un onLogin que nunca termina no lo cuelga", async () => {
      const provider = createFakeProvider({
        authenticate: vi.fn().mockResolvedValue(IDENTITY),
        onLogin: vi.fn(() => new Promise<void>(() => {})),
      });

      await expect(loginWithExternalProvider(provider, "ana", "secreta")).resolves.toBeDefined();
    });

    it("un onLogin que falla no rompe el login: se loguea", async () => {
      const boom = new Error("avatar caído");
      const provider = createFakeProvider({
        authenticate: vi.fn().mockResolvedValue(IDENTITY),
        onLogin: vi.fn().mockRejectedValue(boom),
      });

      await expect(loginWithExternalProvider(provider, "ana", "secreta")).resolves.toBeDefined();
      await vi.waitFor(() =>
        expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: boom }), "auth provider onLogin failed"),
      );
    });

    it("un onLogin que lanza de forma síncrona tampoco lo rompe", async () => {
      const provider = createFakeProvider({
        authenticate: vi.fn().mockResolvedValue(IDENTITY),
        onLogin: vi.fn(() => {
          throw new Error("sync boom");
        }),
      });

      await expect(loginWithExternalProvider(provider, "ana", "secreta")).resolves.toBeDefined();
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.anything(), "auth provider onLogin failed"));
    });

    it("un proveedor sin onLogin (es opcional) inicia sesión igual", async () => {
      const provider = createFakeProvider({ authenticate: vi.fn().mockResolvedValue(IDENTITY) });

      await expect(loginWithExternalProvider(provider, "ana", "secreta")).resolves.toBeDefined();
    });
  });
});
