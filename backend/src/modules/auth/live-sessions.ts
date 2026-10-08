import { getLogger } from "../../config/request-context";
import { getIO, isSocketReady } from "../../socket";
import { disconnectUserSockets } from "../../socket/rooms";
// El repositorio, no `push.service`: este último llama a `webpush.setVapidDetails`
// al cargarse, y el CLI de administración también importa este archivo.
import * as PushRepository from "../push/push.repository";

/// Da de baja todas las suscripciones push del usuario. Sin esto, sus
/// dispositivos seguían recibiendo notificaciones con el texto de los mensajes
/// después de revocarle las sesiones. Nunca tira.
async function dropPushSubscriptions(userId: string): Promise<void> {
  try {
    await PushRepository.deleteByUserId(userId);
  } catch (error) {
    getLogger().warn({ err: error, userId }, "could not delete push subscriptions");
  }
}

/// Corta los sockets abiertos de un usuario y borra sus suscripciones push
/// después de revocar sus sesiones (cambio o restablecimiento de contraseña,
/// cuenta desactivada, LOCAL_AUTH_PLAN.md D9). El socket solo se autentica en
/// el handshake: sin esto seguiría recibiendo mensajes en vivo con un token
/// que ya no vale, y el navegador seguiría mostrando notificaciones.
///
/// Nunca tira: el cambio ya está hecho. Las suscripciones se borran siempre
/// (también desde el CLI, que corre sin Socket.IO). Los sockets en cambio solo
/// se cortan si hay Socket.IO; en un proceso sin él, los que haya en el server
/// mueren en la próxima reconexión, que vuelve a pasar por el handshake.
export function endLiveSessions(userId: string): void {
  void dropPushSubscriptions(userId);
  if (!isSocketReady()) return;
  try {
    disconnectUserSockets(getIO(), userId);
  } catch (error) {
    getLogger().warn({ err: error, userId }, "could not disconnect user sockets");
  }
}
