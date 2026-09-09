import { describe, expect, it, vi } from "vitest";
import { SOCKET_LIFECYCLE_EVENTS } from "./events";
import { attachSocketModules, registerSocketModule } from "./registry";

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
      join: vi.fn(),
      leave: vi.fn(),
      data: { user: { internalUserId: "u-1" } },
    };
    connectionHandler!(mockSocket);

    expect(customModuleA).toHaveBeenCalledWith(mockSocket, mockIo);
    expect(customModuleB).toHaveBeenCalledWith(mockSocket, mockIo);
  });
});
