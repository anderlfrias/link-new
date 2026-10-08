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

// El socket usa el verificador único de sesiones de LINK, igual en todos los modos
// de login. Cada test dice qué identidad devuelve.
vi.mock("../modules/auth/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("../modules/settings/settings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({ localSessionTtlHours: 1 }),
}));

/// Identidad como la que devuelve el verificador: solo lo que dice el token.
function sessionIdentity(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
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
      authProvider: "external-test" as const,
    },
    ...overrides,
  };
}

function activeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "ana@example.com",
    name: "Ana Gomez",
    username: "ana",
    status: "ACTIVE",
    roles: ["admin"],
    tokensValidAfter: null,
    ...overrides,
  } as any;
}

function connect(token: string) {
  const socket = { handshake: { auth: { token } }, data: {} as any };
  const next = vi.fn();
  authenticateSocket(socket as any, next);
  return { socket, next };
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
    vi.mocked(JwtModule.verifyAccessToken).mockImplementation(() => {
      throw new TokenExpiredError("jwt expired", new Date());
    });

    const { next } = connect("expired-jwt");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Token expired" }));
    });
  });

  it("rejects connection with 'Invalid token' when jwt verification throws JsonWebTokenError", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockImplementation(() => {
      throw new JsonWebTokenError("invalid signature");
    });

    const { next } = connect("bad-jwt");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
  });

  it("rejects connection with 'Invalid token' when the session's account does not exist", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue(sessionIdentity() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const { next } = connect("valid-jwt");

    await vi.waitFor(() => {
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
  });

  it("authenticates socket successfully, sets socket.data.user (roles de la base) and calls next()", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue(sessionIdentity() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount());

    const { socket, next } = connect("valid-jwt");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith();
    });
    expect(socket.data.user).toMatchObject({
      id: "user-1",
      internalUserId: "user-1",
      email: "ana@example.com",
      fullName: "Ana Gomez",
      username: "ana",
      roles: ["admin"],
    });
  });

  it("programa la desconexión con el exp del token al autenticar", async () => {
    const identity = sessionIdentity();
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue({
      ...identity,
      user: { ...identity.user, exp: 1_900_000_000 },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount());

    const { socket, next } = connect("valid-jwt");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith();
    });
    expect(scheduleSessionExpiry).toHaveBeenCalledWith(socket, 1_900_000_000);
  });

  it("no programa ningún corte si el socket no se autentica", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockImplementation(() => {
      throw new JsonWebTokenError("invalid signature");
    });

    const { next } = connect("bad-jwt");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
    expect(scheduleSessionExpiry).not.toHaveBeenCalled();
  });

  it("rechaza un token restringido (pcr) sin consultar la base (invariante 8)", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue(sessionIdentity({ mustChangePassword: true }) as any);

    const { socket, next } = connect("pcr-token");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(socket.data.user).toBeUndefined();
  });

  it("una cuenta desactivada no conecta: termina la sesión como un token inválido (invariante 5)", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue(sessionIdentity() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount({ status: "INACTIVE" }));

    const { next } = connect("valid-jwt");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
  });

  it("una sesión emitida antes de tokensValidAfter termina como un token inválido (invariante 3)", async () => {
    const iat = Math.floor(Date.now() / 1000) - 60;
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue(sessionIdentity({ iat }) as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount({ tokensValidAfter: new Date() }));

    const { next } = connect("revoked-token");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
    });
  });

  it("una sesión más vieja que la duración vigente responde 'Token expired'", async () => {
    vi.mocked(JwtModule.verifyAccessToken).mockReturnValue(
      sessionIdentity({ iat: Math.floor(Date.now() / 1000) - 2 * 3600 }) as any,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAccount());

    const { next } = connect("old-token");

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Token expired" }));
    });
  });
});
