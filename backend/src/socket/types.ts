import { Server, Socket } from "socket.io";

/// Instancia de servidor Socket.IO usada en todo el backend. Alias central para
/// no importar "socket.io" directamente fuera de src/socket.
export type AppServer = Server;

/// Instancia de socket de un cliente conectado.
export type AppSocket = Socket;

/// Función que un módulo del sistema registra para conectar sus propios eventos
/// a un socket recién conectado (ver registry.ts).
export type SocketModuleRegistrar = (socket: AppSocket, io: AppServer) => void;

/// Middleware de Socket.IO (autenticación, autorización, validación, logging,
/// rate limiting, etc.). Misma forma que io.use((socket, next) => ...).
export type SocketMiddleware = (socket: AppSocket, next: (err?: Error) => void) => void;
