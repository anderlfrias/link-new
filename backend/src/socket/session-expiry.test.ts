import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleSessionExpiry } from "./session-expiry";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

function buildSocket() {
  const listeners: Record<string, () => void> = {};
  return {
    id: "socket-1",
    data: { user: { internalUserId: "u-1" } },
    disconnect: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      listeners[event] = callback;
    }),
    emitLocal: (event: string) => listeners[event]?.(),
  };
}

describe("scheduleSessionExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("desconecta el socket al llegar a exp", () => {
    const socket = buildSocket();

    scheduleSessionExpiry(socket as any, nowSeconds + 60);

    vi.advanceTimersByTime(59_000);
    expect(socket.disconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("no programa nada si el token no trae exp", () => {
    const socket = buildSocket();

    scheduleSessionExpiry(socket as any, undefined);
    vi.advanceTimersByTime(365 * 24 * 3600 * 1000);

    expect(socket.once).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("desconecta enseguida un token cuyo exp ya pasó", () => {
    const socket = buildSocket();

    scheduleSessionExpiry(socket as any, nowSeconds - 10);
    vi.advanceTimersByTime(0);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("reprograma en tramos cuando exp supera el tope de setTimeout", () => {
    const socket = buildSocket();
    const thirtyDaysSeconds = 30 * 24 * 3600;

    scheduleSessionExpiry(socket as any, nowSeconds + thirtyDaysSeconds);

    // Pasado el primer tramo (~24,8 días) todavía faltan ~5 días: sigue conectado.
    vi.advanceTimersByTime(2_147_483_647);
    expect(socket.disconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(thirtyDaysSeconds * 1000 - 2_147_483_647);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("cancela el temporizador si el socket se desconecta antes", () => {
    const socket = buildSocket();

    scheduleSessionExpiry(socket as any, nowSeconds + 60);
    expect(socket.once).toHaveBeenCalledWith("disconnect", expect.any(Function));
    socket.emitLocal("disconnect");

    vi.advanceTimersByTime(120_000);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
