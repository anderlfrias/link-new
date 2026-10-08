import { attachSocketContext } from "./request-context";
import { authenticateSocket } from "./socket-auth.middleware";
import { AppServer, SocketMiddleware } from "./types";

/// Middlewares globales de Socket.IO, en el orden en que se aplican. A futuro
/// se agregan aquí, en este mismo orden, sin tocar gateway.ts:
///   1. autenticación (verificar el token del modo activo en el handshake) — listo,
///      ver socket-auth.middleware.ts
///   2. autorización
///   3. validación
///   4. logging — listo, ver request-context.ts (adjunta el logger/meta del
///      socket; el contexto en sí se abre por evento con withRequestContext,
///      no acá — ver el comentario de ese archivo)
///   5. rate limiting — listo, pero no es un middleware global de conexión: limita
///      los eventos de cada socket, así que se registra por socket con
///      `socket.use` (ver rate-limit.ts y registry.ts)
export const socketMiddlewares: SocketMiddleware[] = [authenticateSocket, attachSocketContext];

export function applyMiddlewares(io: AppServer, middlewares: SocketMiddleware[]): void {
  middlewares.forEach((middleware) => io.use(middleware));
}
