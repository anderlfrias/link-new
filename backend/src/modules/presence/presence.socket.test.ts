import { describe, expect, it, vi } from "vitest";
import * as RoomsModule from "../../socket/rooms";
import { registerPresenceSocket } from "./presence.socket";

vi.mock("../../socket/rooms", () => ({
  joinUser: vi.fn(),
}));

describe("presence.socket", () => {
  it("joins user to their personal user room (user:<id>) when socket is authenticated", () => {
    const socket = {
      data: {
        user: {
          internalUserId: "u-internal-123",
          email: "test@example.com",
        },
      },
    } as any;
    const io = {} as any;

    registerPresenceSocket(socket, io);

    expect(RoomsModule.joinUser).toHaveBeenCalledWith(socket, "u-internal-123");
  });

  it("does not join any room if socket.data.user is missing or unauthenticated", () => {
    const socket = {
      data: {},
    } as any;
    const io = {} as any;

    registerPresenceSocket(socket, io);

    expect(RoomsModule.joinUser).not.toHaveBeenCalled();
  });
});
