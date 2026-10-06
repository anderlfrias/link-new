import type { Server as HttpServer } from "http";
import { createSocketGateway } from "./gateway";
import { applyMiddlewares, socketMiddlewares } from "./middleware";
import { attachSocketModules } from "./registry";
import { AppServer } from "./types";

let io: AppServer | null = null;

/// Único punto de entrada de la infraestructura de Socket.IO. Crea la
/// instancia, aplica los middlewares globales y registra los módulos Socket.
/// No contiene lógica propia: delega todo en gateway.ts, middleware.ts y
/// registry.ts.
export function initSocket(httpServer: HttpServer): AppServer {
  io = createSocketGateway(httpServer);
  applyMiddlewares(io, socketMiddlewares);
  attachSocketModules(io);
  return io;
}

/// Si este proceso levantó Socket.IO. El CLI de administración
/// (src/cli/auth-admin.ts) comparte servicios con el server pero no tiene
/// sockets: ahí no hay conexiones que cortar.
export function isSocketReady(): boolean {
  return io !== null;
}

/// Expone la instancia ya inicializada para el resto del sistema (ej. un
/// servicio que necesite emitir un evento fuera del ciclo request/response).
export function getIO(): AppServer {
  if (!io) {
    throw new Error("Socket.IO has not been initialized yet - call initSocket() first");
  }
  return io;
}
