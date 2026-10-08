import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RATE_LIMITED_ERROR_MESSAGE,
  SOCKET_BUCKET_CAPACITY,
  SOCKET_REFILL_PER_SECOND,
  registerSocketRateLimit,
} from "./rate-limit";

function buildSocket() {
  let middleware: ((packet: unknown[], next: (err?: Error) => void) => void) | undefined;
  const warn = vi.fn();
  const socket = {
    id: "socket-1",
    data: { user: { internalUserId: "u-1" }, logger: { warn } },
    use: vi.fn((fn: typeof middleware) => {
      middleware = fn;
    }),
    disconnect: vi.fn(),
  };
  return {
    socket,
    warn,
    /// Un evento del cliente: devuelve el argumento con el que se llamó `next`.
    send: (event = "message:typing_start") => {
      const next = vi.fn();
      middleware!([event, { conversationId: "c-1" }], next);
      return next;
    },
  };
}

describe("registerSocketRateLimit", () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
  });

  it("registra un único middleware de paquetes en el socket", () => {
    const { socket } = buildSocket();

    registerSocketRateLimit(socket as any, { now });

    expect(socket.use).toHaveBeenCalledTimes(1);
  });

  it("deja pasar ráfagas dentro de la capacidad", () => {
    const { socket, send } = buildSocket();
    registerSocketRateLimit(socket as any, { now });

    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) {
      expect(send()).toHaveBeenCalledWith();
    }
  });

  it("descarta los eventos por encima del límite con el error rate_limited", () => {
    const { socket, send } = buildSocket();
    registerSocketRateLimit(socket as any, { now });
    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) send();

    const next = send();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: RATE_LIMITED_ERROR_MESSAGE }));
  });

  it("recarga con el tiempo: SOCKET_REFILL_PER_SECOND eventos por segundo", () => {
    const { socket, send } = buildSocket();
    registerSocketRateLimit(socket as any, { now });
    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) send();
    expect(send()).toHaveBeenCalledWith(expect.any(Error));

    // Pasa un segundo: vuelven a caber 20 eventos y el 21 se descarta.
    clock += 1000;
    for (let i = 0; i < SOCKET_REFILL_PER_SECOND; i++) {
      expect(send(), `evento ${i + 1}`).toHaveBeenCalledWith();
    }
    expect(send()).toHaveBeenCalledWith(expect.any(Error));
  });

  it("la recarga no supera la capacidad aunque pase mucho tiempo", () => {
    const { socket, send } = buildSocket();
    registerSocketRateLimit(socket as any, { now });

    clock += 60 * 60 * 1000;
    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) send();

    expect(send()).toHaveBeenCalledWith(expect.any(Error));
  });

  it("cada socket tiene su propio cupo", () => {
    const a = buildSocket();
    const b = buildSocket();
    registerSocketRateLimit(a.socket as any, { now });
    registerSocketRateLimit(b.socket as any, { now });
    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) a.send();

    expect(a.send()).toHaveBeenCalledWith(expect.any(Error));
    expect(b.send()).toHaveBeenCalledWith();
  });

  it("no desconecta el socket aunque el abuso sea sostenido", () => {
    const { socket, send } = buildSocket();
    registerSocketRateLimit(socket as any, { now });

    for (let i = 0; i < SOCKET_BUCKET_CAPACITY * 10; i++) send();

    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("avisa en el log con quién y cuántos, sin el evento ni su contenido, y no más de una vez por intervalo", () => {
    const { socket, warn, send } = buildSocket();
    registerSocketRateLimit(socket as any, { now });
    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) send();

    for (let i = 0; i < 50; i++) send("call:signal");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { userId: "u-1", socketId: "socket-1", dropped: 1 },
      "socket events dropped by rate limit",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("call:signal");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("c-1");

    // Pasado el intervalo, el siguiente descarte vuelve a avisar, con el acumulado.
    clock += 10_000;
    for (let i = 0; i < SOCKET_BUCKET_CAPACITY; i++) send();
    send();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0].dropped).toBeGreaterThan(1);
  });
});
