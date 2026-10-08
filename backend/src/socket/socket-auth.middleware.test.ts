import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../config/prisma";
import * as JwtModule from "../modules/auth/jwt";
import { scheduleSessionExpiry } from "./session-expiry";
import { authenticateSocket } from "./socket-auth.middleware";

vi.mock("./session-expiry", () => ({
  scheduleSessionExpiry: vi.fn(),
}));

vi.mock("../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../modules/auth/jwt", () => {
  const verifyToken = vi.fn();
  const mapTokenToUser = vi.fn();
  return {
    verifyToken,
    mapTokenToUser,
    // El socket usa el verificador único (LOCAL_AUTH_PLAN.md, Fase 4): en modo
    // external-auth equivale a verificar el JWT de EXTERNAL_AUTH y mapearlo.
    verifyAccessToken: vi.fn((token: string) => ({
      mode: "external-auth",
      user: mapTokenToUser(verifyToken(token)),
      mustChangePassword: false,
    })),
  };
});

vi.mock("../modules/settings/settings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({ localSessionTtlHours: 1 }),
}));

/// Identidad como la que devuelve el verificador en modo local.
function localIdentity(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    mode: "local" as const,
    mustChangePassword: false,
    iat: now,
    user: {
      id: "user-1",
      email: "ana@example.com",
      username: null,
      fullName: "",
      roles: [],
      permissions: [],
      app: "link",
      exp: now + 3600,
      authProvider: "local" as const,
    },
    ...overrides,
  };
}

describe("socket-auth.middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects connection with 'Missing token' when token is absent or not a string", () => {
    const invalidSockets = [
      { handshake: { auth: {} }, data: {} },
      { handshake: {}, data: {} },
      { handshake: { auth: { token: 12345 } }, data: {} },
      { handshake: { auth: { token: null } }, data: {} },
    ];

    for (const socket of invalidSockets) {
      const next = vi.fn();
      authenticateSocket(socket as any, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Missing token" }));
    }
  });

  it("rejects connection with 'Token expired' when jwt verification throws TokenExpiredError", async () => {
    const socket = {
      handshake: { auth: { token: "expired-jwt" } },
      data: {},
    };
    const next = vi.fn();

    vi.mocked(JwtModule.verifyToken).mockImplementation(() => {
      throw new TokenExpiredError("jwt expired", new Date());
    });

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Token expired" }));
    });
  });

  it("rejects connection with 'Invalid token' when jwt verification throws JsonWebTokenError", async () => {
    const socket = {
      handshake: { auth: { token: "bad-jwt" } },
      data: {},
    };
    const next = vi.fn();

    vi.mocked(JwtModule.verifyToken).mockImplementation(() => {
      throw new JsonWebTokenError("invalid signature");
    });

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
  });

  it("rejects connection with 'Invalid token' when user email does not exist in local database", async () => {
    const socket = {
      handshake: { auth: { token: "valid-jwt" } },
      data: {},
    };
    const next = vi.fn();

    vi.mocked(JwtModule.verifyToken).mockReturnValue({ id: "ext-1" } as any);
    vi.mocked(JwtModule.mapTokenToUser).mockReturnValue({
      id: "ext-1",
      email: "unknown@example.com",
      username: "unknown",
      fullName: "Unknown",
      roles: ["user"],
      permissions: [],
      app: "CHAT",
      exp: 123456789,
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "unknown@example.com" } });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
  });

  it("authenticates socket successfully, sets socket.data.user and calls next()", async () => {
    const socket = {
      handshake: { auth: { token: "valid-jwt" } },
      data: {} as any,
    };
    const next = vi.fn();

    const mappedUser = {
      id: "ext-1",
      email: "ana@example.com",
      username: "ana",
      fullName: "Ana Gomez",
      roles: ["user", "admin"],
      permissions: [],
      app: "CHAT",
      exp: 123456789,
    };
    vi.mocked(JwtModule.verifyToken).mockReturnValue({ id: "ext-1" } as any);
    vi.mocked(JwtModule.mapTokenToUser).mockReturnValue(mappedUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "internal-uuid-ana", status: "ACTIVE" } as any);

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(socket.data.user).toEqual({
        ...mappedUser,
        internalUserId: "internal-uuid-ana",
      });
      expect(next).toHaveBeenCalledWith();
    });
  });

  it("programa la desconexión con el exp del token al autenticar", async () => {
    const socket = {
      handshake: { auth: { token: "valid-jwt" } },
      data: {} as any,
    };
    const next = vi.fn();
    vi.mocked(JwtModule.verifyToken).mockReturnValue({ id: "ext-1" } as any);
    vi.mocked(JwtModule.mapTokenToUser).mockReturnValue({
      id: "ext-1",
      email: "ana@example.com",
      username: "ana",
      fullName: "Ana Gomez",
      roles: [],
      permissions: [],
      app: "CHAT",
      exp: 1_900_000_000,
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "internal-uuid-ana", status: "ACTIVE" } as any);

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith();
    });
    expect(scheduleSessionExpiry).toHaveBeenCalledWith(socket, 1_900_000_000);
  });

  it("no programa ningún corte si el socket no se autentica", async () => {
    const socket = { handshake: { auth: { token: "bad-jwt" } }, data: {} };
    const next = vi.fn();
    vi.mocked(JwtModule.verifyToken).mockImplementation(() => {
      throw new JsonWebTokenError("invalid signature");
    });

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
    expect(scheduleSessionExpiry).not.toHaveBeenCalled();
  });

  describe("modo local (LOCAL_AUTH_PLAN.md, Fase 4)", () => {
    function connect(token: string) {
      const socket = { handshake: { auth: { token } }, data: {} as any };
      const next = vi.fn();
      authenticateSocket(socket as any, next);
      return { socket, next };
    }

    it("rechaza un token restringido (pcr) sin consultar la base (invariante 8)", async () => {
      vi.mocked(JwtModule.verifyAccessToken).mockReturnValueOnce(localIdentity({ mustChangePassword: true }) as any);

      const { socket, next } = connect("pcr-token");

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(socket.data.user).toBeUndefined();
    });

    it("una cuenta desactivada no conecta: termina la sesión como un token inválido (invariante 5)", async () => {
      vi.mocked(JwtModule.verifyAccessToken).mockReturnValueOnce(localIdentity() as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", status: "INACTIVE" } as any);

      const { next } = connect("local-token");

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
      });
    });

    it("una sesión más vieja que la duración vigente responde 'Token expired'", async () => {
      vi.mocked(JwtModule.verifyAccessToken).mockReturnValueOnce(
        localIdentity({ iat: Math.floor(Date.now() / 1000) - 2 * 3600 }) as any,
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", status: "ACTIVE", localRoles: [] } as any);

      const { next } = connect("old-token");

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Token expired" }));
      });
    });

    it("conecta con un token local y deja los roles de la base en socket.data.user", async () => {
      vi.mocked(JwtModule.verifyAccessToken).mockReturnValueOnce(localIdentity() as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "ana@example.com",
        name: "Ana",
        username: "ana",
        status: "ACTIVE",
        localRoles: ["admin"],
        tokensValidAfter: null,
      } as any);

      const { socket, next } = connect("local-token");

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith();
      });
      expect(socket.data.user).toMatchObject({ internalUserId: "user-1", roles: ["admin"], authProvider: "local" });
    });
  });
});
