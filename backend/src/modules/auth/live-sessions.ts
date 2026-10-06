import { getLogger } from "../../config/request-context";
import { getIO, isSocketReady } from "../../socket";
import { disconnectUserSockets } from "../../socket/rooms";

/// Corta los sockets abiertos de un usuario después de revocar sus sesiones
/// (cambio o restablecimiento de contraseña, cuenta desactivada,
/// LOCAL_AUTH_PLAN.md D9). El socket solo se autentica en el handshake: sin
/// esto seguiría recibiendo mensajes en vivo con un token que ya no vale.
///
/// Nunca tira: el cambio ya está hecho. En un proceso sin Socket.IO (el CLI)
/// no hay nada que cortar; esos sockets, si los hay en el server, mueren en la
/// próxima reconexión, que vuelve a pasar por el handshake.
export function endLiveSessions(userId: string): void {
  if (!isSocketReady()) return;
  try {
    disconnectUserSockets(getIO(), userId);
  } catch (error) {
    getLogger().warn({ err: error, userId }, "could not disconnect user sockets");
  }
}
