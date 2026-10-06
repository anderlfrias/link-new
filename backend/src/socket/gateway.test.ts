import http from "http";
import { describe, expect, it, vi } from "vitest";
import { corsOrigin } from "../config/cors-origins";
import { createSocketGateway } from "./gateway";
import { getIO, initSocket } from "./index";

// index.ts registra los módulos de socket, entre ellos llamadas, que importa
// push.service.ts, y este llama a `webpush.setVapidDetails` al cargarse: con
// las claves VAPID ficticias de vitest.config.ts tira y el archivo entero de
// test no llega a correr. Mismo mock que call.service.test.ts; acá no se prueba push.
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class extends Error {},
}));

describe("socket gateway & initialization", () => {
  it("createSocketGateway instantiates Socket.IO Server with corsOrigin", () => {
    const server = http.createServer();
    const io = createSocketGateway(server);

    expect(io).toBeDefined();
    // Verify opts contain cors origin configuration
    expect((io as any).opts.cors.origin).toEqual(corsOrigin);
  });

  it("initSocket initializes gateway, applies middlewares, and exposes instance via getIO()", () => {
    const server = http.createServer();
    const io = initSocket(server);

    expect(io).toBeDefined();
    expect(getIO()).toBe(io);
  });
});
