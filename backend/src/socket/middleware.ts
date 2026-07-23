import { AppServer, SocketMiddleware } from "./types";

/// Middlewares globales de Socket.IO, en el orden en que se aplican.
/// Vacío por ahora: este paso solo prepara la infraestructura. A futuro se
/// agregan aquí, en este mismo orden, sin tocar gateway.ts:
///   1. autenticación (verificar el token de EXTERNAL_AUTH en el handshake)
///   2. autorización
///   3. validación
///   4. logging
///   5. rate limiting
export const socketMiddlewares: SocketMiddleware[] = [];

export function applyMiddlewares(io: AppServer, middlewares: SocketMiddleware[]): void {
  middlewares.forEach((middleware) => io.use(middleware));
}
