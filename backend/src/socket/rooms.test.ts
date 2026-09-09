import { describe, expect, it, vi } from "vitest";
import {
  conversationRoomName,
  getConnectedUserIds,
  joinConversation,
  joinUser,
  leaveConversation,
  leaveUser,
  userRoomName,
} from "./rooms";

describe("socket rooms", () => {
  describe("room naming pure functions", () => {
    it("conversationRoomName formats string exact as conversation:<id>", () => {
      expect(conversationRoomName("conv-123")).toBe("conversation:conv-123");
      expect(conversationRoomName("abc-def")).toBe("conversation:abc-def");
    });

    it("userRoomName formats string exact as user:<id>", () => {
      expect(userRoomName("user-456")).toBe("user:user-456");
      expect(userRoomName("u-1")).toBe("user:u-1");
    });
  });

  describe("room join/leave actions", () => {
    it("joinConversation delegates socket.join with conversation room name", () => {
      const socket = { join: vi.fn() } as any;
      joinConversation(socket, "c-1");
      expect(socket.join).toHaveBeenCalledWith("conversation:c-1");
    });

    it("leaveConversation delegates socket.leave with conversation room name", () => {
      const socket = { leave: vi.fn() } as any;
      leaveConversation(socket, "c-1");
      expect(socket.leave).toHaveBeenCalledWith("conversation:c-1");
    });

    it("joinUser delegates socket.join with user room name", () => {
      const socket = { join: vi.fn() } as any;
      joinUser(socket, "u-1");
      expect(socket.join).toHaveBeenCalledWith("user:u-1");
    });

    it("leaveUser delegates socket.leave with user room name", () => {
      const socket = { leave: vi.fn() } as any;
      leaveUser(socket, "u-1");
      expect(socket.leave).toHaveBeenCalledWith("user:u-1");
    });
  });

  describe("getConnectedUserIds", () => {
    it("queries room sockets, extracts internalUserIds, filters falsy and deduplicates", async () => {
      const mockSockets = [
        { data: { user: { internalUserId: "u-1" } } },
        { data: { user: { internalUserId: "u-2" } } },
        { data: { user: { internalUserId: "u-1" } } }, // duplicate (multiple tabs)
        { data: { user: undefined } }, // anonymous/unauthenticated edge
        { data: {} },
      ];

      const fetchSockets = vi.fn().mockResolvedValue(mockSockets);
      const io = {
        in: vi.fn().mockReturnValue({ fetchSockets }),
      } as any;

      const userIds = await getConnectedUserIds(io, "conv-99");

      expect(io.in).toHaveBeenCalledWith("conversation:conv-99");
      expect(fetchSockets).toHaveBeenCalled();
      expect(userIds).toEqual(["u-1", "u-2"]);
    });

    it("returns empty array when room has no connected sockets", async () => {
      const io = {
        in: vi.fn().mockReturnValue({ fetchSockets: vi.fn().mockResolvedValue([]) }),
      } as any;

      const userIds = await getConnectedUserIds(io, "empty-conv");
      expect(userIds).toEqual([]);
    });
  });
});
