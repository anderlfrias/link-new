import { Server, Socket } from "socket.io";
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

/// Función que un módulo del sistema registra para conectar sus propios eventos
/// a un socket recién conectado (ver registry.ts).
export type SocketModuleRegistrar = (socket: AppSocket, io: AppServer) => void;

/// Middleware de Socket.IO (autenticación, autorización, validación, logging,
/// rate limiting, etc.). Misma forma que io.use((socket, next) => ...).
export type SocketMiddleware = (socket: AppSocket, next: (err?: Error) => void) => void;
