import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../socket", () => ({
  getIO: vi.fn(() => ({ io: true })),
  isSocketReady: vi.fn(),
}));
vi.mock("../../socket/rooms", () => ({
  disconnectUserSockets: vi.fn(),
}));
vi.mock("../push/push.repository", () => ({
  deleteByUserId: vi.fn(),
}));

import { getIO, isSocketReady } from "../../socket";
import { disconnectUserSockets } from "../../socket/rooms";
import * as PushRepository from "../push/push.repository";
import { endLiveSessions } from "./live-sessions";

describe("endLiveSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PushRepository.deleteByUserId).mockResolvedValue({ count: 1 } as any);
  });

  it("borra las suscripciones push del usuario aunque no haya Socket.IO (CLI)", () => {
    vi.mocked(isSocketReady).mockReturnValue(false);

    endLiveSessions("u-1");

    expect(PushRepository.deleteByUserId).toHaveBeenCalledWith("u-1");
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });

  it("corta los sockets del usuario cuando hay Socket.IO", () => {
    vi.mocked(isSocketReady).mockReturnValue(true);

    endLiveSessions("u-1");

    expect(disconnectUserSockets).toHaveBeenCalledWith(getIO(), "u-1");
    expect(PushRepository.deleteByUserId).toHaveBeenCalledWith("u-1");
  });

  it("un error al borrar las suscripciones no tira ni impide cortar los sockets", async () => {
    vi.mocked(isSocketReady).mockReturnValue(true);
    vi.mocked(PushRepository.deleteByUserId).mockRejectedValue(new Error("db down"));

    expect(() => endLiveSessions("u-1")).not.toThrow();
    // Deja que se resuelva la promesa descartada: no tiene que quedar un rechazo sin manejar.
    await new Promise((resolve) => setImmediate(resolve));

    expect(disconnectUserSockets).toHaveBeenCalledWith(getIO(), "u-1");
  });

  it("un error al cortar los sockets no tira", () => {
    vi.mocked(isSocketReady).mockReturnValue(true);
    vi.mocked(disconnectUserSockets).mockImplementation(() => {
      throw new Error("io error");
    });

    expect(() => endLiveSessions("u-1")).not.toThrow();
    expect(PushRepository.deleteByUserId).toHaveBeenCalledWith("u-1");
  });
});
