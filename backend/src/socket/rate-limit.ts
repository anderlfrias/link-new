import { logger } from "../config/logger";
import { AppSocket, AuthenticatedSocketUser, SocketContextData } from "./types";

/// Cupo de eventos de un socket: un "token bucket". Cada evento del cliente
/// gasta un token; el cubo se llena a `refillPerSecond` hasta `capacity`. Una
/// ráfaga normal (abrir una conversación, el intercambio de candidatos ICE al
/// iniciar una llamada) queda muy por debajo de la capacidad, y un cliente que
/// manda eventos en bucle (`message:typing_*`, `call:signal`, `conversation:join`)
/// agota el cupo y solo logra 20 por segundo.
export const SOCKET_BUCKET_CAPACITY = 60;
export const SOCKET_REFILL_PER_SECOND = 20;

/// Como mucho un aviso en el log por socket y por intervalo: un flood no tiene
/// que llenar el log con una línea por evento descartado.
const WARN_INTERVAL_MS = 10_000;

export const RATE_LIMITED_ERROR_MESSAGE = "rate_limited";

interface SocketRateLimitOptions {
  capacity?: number;
  refillPerSecond?: number;
  /// Para los tests: reloj inyectable.
  now?: () => number;
}

/// Limita la frecuencia de los eventos que manda cada socket. Se registra con
/// `socket.use`, que corre antes del handler de cualquier evento del cliente
/// (los eventos de ciclo de vida, como `disconnecting`, no pasan por acá).
///
/// Un evento por encima del cupo se **descarta** (`next(error)`: el handler no
/// corre) y el socket sigue conectado. A propósito no se desconecta al que
/// abusa: reconectar le cuesta más al servidor (un handshake con consulta a la
/// base) que descartar el evento, y el cliente oficial toma
/// `io server disconnect` como sesión terminada (socket-provider.tsx), así que
/// una desconexión por abuso se vería como "sesión expirada".
///
/// Los eventos con acknowledgement (`conversation:join`, `call:initiate`) que se
/// descartan nunca reciben respuesta: el cliente se queda sin su callback.
export function registerSocketRateLimit(socket: AppSocket, options: SocketRateLimitOptions = {}): void {
  const { capacity = SOCKET_BUCKET_CAPACITY, refillPerSecond = SOCKET_REFILL_PER_SECOND, now = Date.now } = options;

  let tokens = capacity;
  let lastRefillAt = now();
  let dropped = 0;
  let lastWarnAt = -Infinity;

  socket.use((_packet, next) => {
    const current = now();
    tokens = Math.min(capacity, tokens + ((current - lastRefillAt) / 1000) * refillPerSecond);
    lastRefillAt = current;

    if (tokens >= 1) {
      tokens -= 1;
      next();
      return;
    }

    dropped += 1;
    if (current - lastWarnAt >= WARN_INTERVAL_MS) {
      const user = socket.data.user as AuthenticatedSocketUser | undefined;
      const socketLogger = (socket.data as Partial<SocketContextData>).logger ?? logger;
      // Solo cuántos eventos y de quién: nunca el nombre ni el contenido del evento.
      socketLogger.warn({ userId: user?.internalUserId, socketId: socket.id, dropped }, "socket events dropped by rate limit");
      lastWarnAt = current;
      dropped = 0;
    }
    next(new Error(RATE_LIMITED_ERROR_MESSAGE));
  });
}
