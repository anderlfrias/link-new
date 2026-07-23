import { authenticateSocket } from "./socket-auth.middleware";
import { AppServer, SocketMiddleware } from "./types";

/// Middlewares globales de Socket.IO, en el orden en que se aplican. A futuro
/// se agregan aquí, en este mismo orden, sin tocar gateway.ts:
///   1. autenticación (verificar el token de EXTERNAL_AUTH en el handshake) — listo,
///      ver socket-auth.middleware.ts
///   2. autorización
///   3. validación
///   4. logging
///   5. rate limiting
export const socketMiddlewares: SocketMiddleware[] = [authenticateSocket];

export function applyMiddlewares(io: AppServer, middlewares: SocketMiddleware[]): void {
  middlewares.forEach((middleware) => io.use(middleware));
}
