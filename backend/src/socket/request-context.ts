import { logger } from "../config/logger";
import { runWithContext, type RequestMeta } from "../config/request-context";
import { AppSocket, AuthenticatedSocketUser, SocketContextData, SocketMiddleware } from "./types";

/// Middleware global (posición 4 de la cadena, ver middleware.ts): adjunta a
/// cada socket su logger y su meta. No abre contexto de AsyncLocalStorage — un
/// io.use() corre una vez por conexión, no por evento; para eso está
/// `withRequestContext`.
export const attachSocketContext: SocketMiddleware = (socket, next) => {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  socket.data.logger = logger.child({ socketId: socket.id, userId: user?.internalUserId });
  socket.data.meta = {
    // El equivalente de req.ip para un socket. `handshake.address` respeta el
    // mismo trust proxy que Express (ver gateway.ts / app.ts).
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers["user-agent"],
    actorUserId: user?.internalUserId,
    actorEmail: user?.email,
  } satisfies RequestMeta;
  next();
};

/// Envuelve un handler de evento para que todo lo que loguee o audite río abajo
/// lleve el contexto del socket. Se usa al registrar cada listener en un
/// *.socket.ts:
///
///   socket.on(MESSAGE_EVENTS.TYPING, withRequestContext(socket, (payload) => ...));
export function withRequestContext<A extends unknown[]>(
  socket: AppSocket,
  handler: (...args: A) => void | Promise<void>,
): (...args: A) => void {
  return (...args: A) => {
    const data = socket.data as Partial<SocketContextData>;
    const socketLogger = data.logger ?? logger;
    const meta: RequestMeta = data.meta ?? {};
    void runWithContext(socketLogger, meta, () => handler(...args));
  };
}
