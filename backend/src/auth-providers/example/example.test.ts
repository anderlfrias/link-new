import { join } from "node:path";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION_JWT_SECRET } from "../../test/auth-mode";

vi.mock("../../modules/auth/auth.repository", () => ({
  upsertExternalUser: vi.fn(),
  findProviderUsersWithoutAvatar: vi.fn(),
}));

vi.mock("../../modules/auth/auth.service", () => ({
  setAvatarFromProvider: vi.fn(),
}));

vi.mock("../../modules/settings/settings.service", () => ({
  getLocalAuthPolicy: vi.fn().mockResolvedValue({ sessionTtlHours: 12 }),
}));

import { upsertExternalUser } from "../../modules/auth/auth.repository";
import { loginWithExternalProvider } from "../../modules/auth/external-login.service";
import { AUTH_PROVIDER_API_VERSION, AuthProvider } from "../api";
import { getAuthProvider, setAuthProvider } from "../registry";
import { initAuthProvider } from "../init";
import { loadAuthProvider } from "../loader";
import { EXAMPLE_USERS } from "./index";

/// Test de CONTRATO: el proveedor de ejemplo se carga con el loader real y se prueba a través de la
/// orquestación real del login. Si un cambio del core rompe la interfaz que usan los plugins, se rompe
/// este test antes que la instalación de alguien.
const EXAMPLE_MODULE = join(__dirname, "index");

// Por defecto los tests corren con cuentas locales: cada test restaura ese estado.
const original = getAuthProvider();

function storedAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "ana@example.com",
    name: "Ana Admin",
    username: "ana",
    roles: ["admin"],
    status: "ACTIVE",
    notificationSoundEnabled: true,
    language: "es",
    syncProfileWithIntegration: true,
    ...overrides,
  } as never;
}

let provider: AuthProvider;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(upsertExternalUser).mockResolvedValue(storedAccount());
  provider = await loadAuthProvider(EXAMPLE_MODULE);
});

afterEach(() => {
  setAuthProvider(original);
  vi.unstubAllEnvs();
});

describe("el proveedor de ejemplo, cargado con el loader real", () => {
  it("cumple el contrato: id, nombre visible, versión de la interfaz y las operaciones", () => {
    expect(provider).toMatchObject({ id: "example", displayName: "Example", apiVersion: AUTH_PROVIDER_API_VERSION });
    expect(provider.authenticate).toBeTypeOf("function");
    expect(provider.onLogin).toBeTypeOf("function");
  });

  it("init se niega a arrancar en producción: tiene las contraseñas escritas en el código", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(loadAuthProvider(EXAMPLE_MODULE)).rejects.toThrow(
      'The "example" auth provider could not start: The example auth provider is for tests and documentation only',
    );
  });

  it("initAuthProvider lo deja activo cuando AUTH_PROVIDER_MODULE lo señala", async () => {
    const loaded = await initAuthProvider({ AUTH_PROVIDER_MODULE: EXAMPLE_MODULE });

    expect(loaded?.id).toBe("example");
    expect(getAuthProvider()).toBe(loaded);
  });
});

describe("el login con el proveedor de ejemplo, por la orquestación real de LINK", () => {
  it("una persona válida inicia sesión: LINK guarda la cuenta con los roles que conoce y emite su propia sesión", async () => {
    const { record, response } = await loginWithExternalProvider(provider, "ana", "ana-pass");

    expect(upsertExternalUser).toHaveBeenCalledWith(
      "example",
      { externalId: "ex-1", email: "ana@example.com", username: "ana", fullName: "Ana Admin" },
      // El proveedor informó dos roles; LINK conoce uno.
      { roles: ["admin"] },
    );
    expect(record.id).toBe("user-1");
    expect(response.user).toMatchObject({ internalUserId: "user-1", authProvider: "example", roles: ["admin"] });
    const session = jwt.verify(response.token, TEST_SESSION_JWT_SECRET, { issuer: "link", audience: "link" });
    expect(session).toMatchObject({ sub: "user-1" });
  });

  it("también se entra con el correo", async () => {
    await expect(loginWithExternalProvider(provider, "BETO@example.com", "beto-pass")).resolves.toBeDefined();
  });

  it("una contraseña incorrecta y una persona inexistente dan el mismo 401: no se confirma qué cuentas hay", async () => {
    const wrongPassword = await loginWithExternalProvider(provider, "ana", "mala").catch((e: unknown) => e);
    const unknown = await loginWithExternalProvider(provider, "nadie", "mala").catch((e: unknown) => e);

    expect(wrongPassword).toMatchObject({ statusCode: 401 });
    expect(unknown).toMatchObject({ statusCode: 401 });
    expect((wrongPassword as Error).message).toBe((unknown as Error).message);
    expect(upsertExternalUser).not.toHaveBeenCalled();
  });

  it("una persona a la que el proveedor no deja entrar a esta aplicación da 403", async () => {
    await expect(loginWithExternalProvider(provider, "denegado", "denegado-pass")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("onLogin sincroniza el directorio con el contexto del core, marcado con el id del proveedor", async () => {
    await loginWithExternalProvider(provider, "ana", "ana-pass");

    await vi.waitFor(() => {
      // Una vez para el login y una por cada persona del directorio con acceso.
      const directoryCalls = vi.mocked(upsertExternalUser).mock.calls.filter((call) => call[2] === undefined);
      expect(directoryCalls.map((call) => call[1].externalId)).toEqual(
        EXAMPLE_USERS.filter((user) => !user.denied).map((user) => user.externalId),
      );
      expect(directoryCalls.every((call) => call[0] === "example")).toBe(true);
    });
  });

  it("un onLogin que falla no rompe el login", async () => {
    vi.mocked(upsertExternalUser)
      .mockResolvedValueOnce(storedAccount())
      .mockRejectedValue(new Error("base caída durante la sincronización"));

    await expect(loginWithExternalProvider(provider, "ana", "ana-pass")).resolves.toBeDefined();
  });
});
