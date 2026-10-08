import { describe, expect, it, vi } from "vitest";
import { SOCKET_LIFECYCLE_EVENTS } from "./events";
import { attachSocketModules, registerSocketModule } from "./registry";

// registry.ts importa el módulo de llamadas, que importa push.service.ts, y
// este llama a `webpush.setVapidDetails` al cargarse: con las claves VAPID
// ficticias de vitest.config.ts tira y el archivo entero de test no llega a
// correr. Mismo mock que call.service.test.ts; acá no se prueba push.
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class extends Error {},
}));

describe("socket registry", () => {
  it("attaches connection listener to io server and executes registered modules on connection", () => {
    let connectionHandler: ((socket: any) => void) | undefined;

    const mockIo = {
      on: vi.fn((event: string, handler: (socket: any) => void) => {
        if (event === SOCKET_LIFECYCLE_EVENTS.CONNECTION) {
          connectionHandler = handler;
        }
      }),
    } as any;

    const customModuleA = vi.fn();
    const customModuleB = vi.fn();

    registerSocketModule(customModuleA);
    registerSocketModule(customModuleB);

    attachSocketModules(mockIo);

    expect(mockIo.on).toHaveBeenCalledWith(SOCKET_LIFECYCLE_EVENTS.CONNECTION, expect.any(Function));
    expect(connectionHandler).toBeDefined();

    const mockSocket = {
      id: "sock-1",
      on: vi.fn(),
      use: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      data: { user: { internalUserId: "u-1" } },
    };
    connectionHandler!(mockSocket);

    // El límite de frecuencia se registra en cada socket nuevo (socket.use), antes de los módulos.
    expect(mockSocket.use).toHaveBeenCalledTimes(1);
    expect(customModuleA).toHaveBeenCalledWith(mockSocket, mockIo);
    expect(customModuleB).toHaveBeenCalledWith(mockSocket, mockIo);
  });
});
