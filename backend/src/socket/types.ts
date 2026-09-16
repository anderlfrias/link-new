import type { Logger } from "pino";
import { Server, Socket } from "socket.io";
import type { RequestMeta } from "../config/request-context";
import { MappedUser } from "../modules/auth/auth.types";

/// Instancia de servidor Socket.IO usada en todo el backend. Alias central para
/// no importar "socket.io" directamente fuera de src/socket.
export type AppServer = Server;

/// Instancia de socket de un cliente conectado.
export type AppSocket = Socket;

/// Usuario ya autenticado por `authenticateSocket` (ver
/// `socket-auth.middleware.ts`), disponible en `socket.data.user` para
/// cualquier módulo que necesite saber a qué usuario pertenece un socket.
/// Mismo `MappedUser` que usa la autenticación HTTP, con `internalUserId`
/// siempre presente (a diferencia de `Request.user`, donde es opcional).
export type AuthenticatedSocketUser = MappedUser & { internalUserId: string };

/// Forma de `socket.data.logger` / `socket.data.meta`, adjuntados por
/// `attachSocketContext` (ver request-context.ts) al conectar el socket, y
/// leídos por `withRequestContext` en cada evento. `socket.data` en sí sigue
/// siendo `any` (mismo patrón que `AuthenticatedSocketUser` para
/// `socket.data.user`, arriba) — este tipo documenta la forma esperada para
/// castear en los puntos donde se lee, no es una restricción estructural real
/// impuesta por Socket.IO.
export type SocketContextData = {
  logger: Logger;
  meta: RequestMeta;
};

/// Función que un módulo del sistema registra para conectar sus propios eventos
/// a un socket recién conectado (ver registry.ts).
export type SocketModuleRegistrar = (socket: AppSocket, io: AppServer) => void;

/// Middleware de Socket.IO (autenticación, autorización, validación, logging,
/// rate limiting, etc.). Misma forma que io.use((socket, next) => ...).
export type SocketMiddleware = (socket: AppSocket, next: (err?: Error) => void) => void;
