import { describe, expect, it, vi } from "vitest";
import { getLogger, getRequestMeta } from "../config/request-context";
import { logger } from "../config/logger";
import { attachSocketContext, withRequestContext } from "./request-context";
import type { AuthenticatedSocketUser } from "./types";

function createMockSocket(overrides: Record<string, unknown> = {}) {
  return {
    id: "socket-1",
    handshake: {
      address: "203.0.113.5",
      headers: { "user-agent": "vitest" },
      auth: {},
    },
    data: {},
    ...overrides,
  } as never;
}

function buildAuthenticatedUser(overrides: Partial<AuthenticatedSocketUser> = {}): AuthenticatedSocketUser {
  return {
    id: "ext-1",
    email: "ana@example.com",
    username: "ana",
    fullName: "Ana Gómez",
    roles: [],
    permissions: [],
    app: "chat-interno",
    exp: Math.floor(Date.now() / 1000) + 3600,
    internalUserId: "internal-1",
    ...overrides,
  };
}

describe("attachSocketContext", () => {
  it("deja socket.data.logger y socket.data.meta definidos y llama a next()", () => {
    const socket = createMockSocket();
    const next = vi.fn();

    attachSocketContext(socket, next);

    expect((socket as { data: { logger: unknown } }).data.logger).toBeDefined();
    expect((socket as { data: { meta: unknown } }).data.meta).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("con socket.data.user presente, el child se crea con userId y socketId, y el meta trae actorUserId/actorEmail", () => {
    const user = buildAuthenticatedUser();
    const socket = createMockSocket({ data: { user } });
    const next = vi.fn();

    attachSocketContext(socket, next);

    const { data } = socket as { data: { logger: import("pino").Logger; meta: unknown } };
    expect(data.logger.bindings()).toEqual({ socketId: "socket-1", userId: "internal-1" });
    expect(data.meta).toEqual({
      ip: "203.0.113.5",
      userAgent: "vitest",
      actorUserId: "internal-1",
      actorEmail: "ana@example.com",
    });
  });

  it("sin socket.data.user (socket sin autenticar), no tira y userId/actorUserId/actorEmail quedan undefined", () => {
    const socket = createMockSocket();
    const next = vi.fn();

    expect(() => attachSocketContext(socket, next)).not.toThrow();

    const { data } = socket as { data: { logger: import("pino").Logger; meta: Record<string, unknown> } };
    expect(data.logger.bindings()).toEqual({ socketId: "socket-1", userId: undefined });
    expect(data.meta.actorUserId).toBeUndefined();
    expect(data.meta.actorEmail).toBeUndefined();
  });

  it("el meta trae ip y userAgent tomados del handshake", () => {
    const socket = createMockSocket({
      handshake: { address: "198.51.100.9", headers: { "user-agent": "custom-client" }, auth: {} },
    });
    const next = vi.fn();

    attachSocketContext(socket, next);

    const { data } = socket as { data: { meta: { ip: string; userAgent: string } } };
    expect(data.meta.ip).toBe("198.51.100.9");
    expect(data.meta.userAgent).toBe("custom-client");
  });
});

describe("withRequestContext", () => {
  it("invoca el handler con los mismos argumentos que recibió", () => {
    const socket = createMockSocket();
    const handler = vi.fn();
    const wrapped = withRequestContext(socket, handler);

    wrapped("arg1", "arg2");

    expect(handler).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("dentro del handler, getLogger() devuelve socket.data.logger y getRequestMeta() el meta", () => {
    const contextLogger = logger.child({ scope: "test-socket" });
    const meta = { requestId: "req-1" };
    const socket = createMockSocket({ data: { logger: contextLogger, meta } });

    let capturedLogger: unknown;
    let capturedMeta: unknown;
    const wrapped = withRequestContext(socket, () => {
      capturedLogger = getLogger();
      capturedMeta = getRequestMeta();
    });

    wrapped();

    expect(capturedLogger).toBe(contextLogger);
    expect(capturedMeta).toBe(meta);
  });

  it("si socket.data.logger no está seteado, cae al logger raíz sin tirar", () => {
    const socket = createMockSocket(); // data: {}, sin logger/meta

    let capturedLogger: unknown;
    const wrapped = withRequestContext(socket, () => {
      capturedLogger = getLogger();
    });

    expect(() => wrapped()).not.toThrow();
    expect(capturedLogger).toBe(logger);
  });
});
