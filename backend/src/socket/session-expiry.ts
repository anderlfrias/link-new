import { getLogger } from "../config/request-context";
import { AppSocket, AuthenticatedSocketUser } from "./types";

/// Tope de `setTimeout` (~24,8 días): con un valor mayor Node lo dispara de
/// inmediato. La duración de sesión del modo local admite hasta 720 h (30
/// días), así que un `exp` lejano se espera en tramos.
const MAX_TIMEOUT_MS = 2_147_483_647;

/// Corta el socket cuando vence su token. El token solo se verifica en el
/// handshake (`authenticateSocket`): sin esto, una conexión abierta seguía
/// recibiendo mensajes en vivo indefinidamente, más allá de la sesión que la
/// autorizó. Las revocaciones (cuenta desactivada, contraseña cambiada) ya
/// cortan los sockets por otro camino (`endLiveSessions`); esto cubre el
/// vencimiento natural.
///
/// `expSeconds` es el `exp` del token, en segundos desde epoch (el mismo campo
/// en los dos modos de autenticación). Sin `exp` no hay nada que programar.
/// Se corta en el `exp` firmado: bajar después la duración de sesión del modo
/// local no acorta las conexiones que ya existen.
export function scheduleSessionExpiry(
  socket: AppSocket,
  expSeconds: number | undefined,
  now: number = Date.now(),
): void {
  if (!expSeconds) return;

  let timer: NodeJS.Timeout | undefined;

  const arm = (remainingMs: number) => {
    timer = setTimeout(() => {
      const leftMs = expSeconds * 1000 - Date.now();
      // Sesión larga: todavía falta, se espera otro tramo.
      if (leftMs > 0) {
        arm(leftMs);
        return;
      }
      const user = socket.data.user as AuthenticatedSocketUser | undefined;
      getLogger().info({ userId: user?.internalUserId, socketId: socket.id }, "socket session expired");
      // `true` cierra la conexión de transporte, no solo el namespace.
      socket.disconnect(true);
    }, Math.min(Math.max(remainingMs, 0), MAX_TIMEOUT_MS));
    // El temporizador no tiene que mantener vivo el proceso al apagar el servidor.
    timer.unref?.();
  };

  arm(expSeconds * 1000 - now);
  socket.once("disconnect", () => {
    if (timer) clearTimeout(timer);
  });
}
