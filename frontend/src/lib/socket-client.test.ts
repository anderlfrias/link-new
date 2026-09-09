import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSocketInstance = {
  disconnect: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocketInstance),
}));

import { io } from "socket.io-client";
import { connectSocket, disconnectSocket, getSocket } from "./socket-client";

describe("socket-client", () => {
  beforeEach(() => {
    disconnectSocket();
    vi.clearAllMocks();
  });

  it("connectSocket creates socket.io connection with auth token and env.socketUrl", () => {
    expect(getSocket()).toBeNull();

    const socket = connectSocket("token-123");

    expect(io).toHaveBeenCalledWith("http://localhost:4000", {
      auth: { token: "token-123" },
    });
    expect(socket).toBe(mockSocketInstance);
    expect(getSocket()).toBe(mockSocketInstance);
  });

  it("connectSocket disconnects existing socket before creating new one", () => {
    connectSocket("token-1");
    expect(io).toHaveBeenCalledTimes(1);

    connectSocket("token-2");
    expect(mockSocketInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledTimes(2);
    expect(io).toHaveBeenLastCalledWith("http://localhost:4000", {
      auth: { token: "token-2" },
    });
  });

  it("disconnectSocket disconnects active socket and clears instance", () => {
    connectSocket("token-1");
    expect(getSocket()).not.toBeNull();

    disconnectSocket();
    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
    expect(getSocket()).toBeNull();
  });
});
