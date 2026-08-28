import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { corsOrigin } from "../config/cors-origins";
import { AppServer } from "./types";

/// Crea la instancia de Socket.IO a partir de un servidor HTTP ya existente.
/// No sabe nada de Express: recibe cualquier http.Server, por lo que Express y
/// Socket.IO quedan desacoplados (server.ts es el único lugar que conoce a los dos).
///
/// El logging de conexiones/desconexiones/errores (con el logger real, ver
/// src/utils o un futuro src/config/logger.ts) y los adaptadores para escalar
/// horizontalmente (ej. Redis Adapter) se agregan más adelante aquí mismo, sin
/// tocar el resto de la infraestructura.
export function createSocketGateway(httpServer: HttpServer): AppServer {
  return new Server(httpServer, {
    cors: { origin: corsOrigin },
  });
}
