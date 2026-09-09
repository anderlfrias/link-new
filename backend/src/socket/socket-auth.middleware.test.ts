import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../config/prisma";
import * as JwtModule from "../modules/auth/jwt";
import { authenticateSocket } from "./socket-auth.middleware";

vi.mock("../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../modules/auth/jwt", () => ({
  verifyToken: vi.fn(),
  mapTokenToUser: vi.fn(),
}));

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
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "internal-uuid-ana" } as any);

    authenticateSocket(socket as any, next);

    await vi.waitFor(() => {
      expect(socket.data.user).toEqual({
        ...mappedUser,
        internalUserId: "internal-uuid-ana",
      });
      expect(next).toHaveBeenCalledWith();
    });
  });
});
