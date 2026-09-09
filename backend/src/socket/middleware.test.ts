import { describe, expect, it, vi } from "vitest";
import { applyMiddlewares, socketMiddlewares } from "./middleware";
import { authenticateSocket } from "./socket-auth.middleware";
import { SocketMiddleware } from "./types";

describe("socket middlewares", () => {
  it("exports default socketMiddlewares with authenticateSocket", () => {
    expect(socketMiddlewares).toContain(authenticateSocket);
    expect(socketMiddlewares[0]).toBe(authenticateSocket);
  });

  it("applyMiddlewares registers each middleware sequentially with io.use", () => {
    const registeredMiddlewares: SocketMiddleware[] = [];
    const mockIo = {
      use: vi.fn((mw) => {
        registeredMiddlewares.push(mw);
      }),
    } as any;

    const mw1: SocketMiddleware = vi.fn();
    const mw2: SocketMiddleware = vi.fn();
    const mw3: SocketMiddleware = vi.fn();

    applyMiddlewares(mockIo, [mw1, mw2, mw3]);

    expect(mockIo.use).toHaveBeenCalledTimes(3);
    expect(registeredMiddlewares).toEqual([mw1, mw2, mw3]);
  });

  it("allows middleware to abort chain with error via next(error)", () => {
    const socket = {} as any;
    const next = vi.fn();
    const error = new Error("Connection disallowed");

    const failingMiddleware: SocketMiddleware = (_s, n) => {
      n(error);
    };

    failingMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
