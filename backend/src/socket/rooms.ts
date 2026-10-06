import { AppServer, AppSocket, AuthenticatedSocketUser } from "./types";

/// Construyen el nombre de una room a partir de un id. Ningún otro archivo del
/// proyecto debe construir estos strings a mano.
export function conversationRoomName(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function userRoomName(userId: string): string {
  return `user:${userId}`;
}

/// Únicos puntos del proyecto autorizados a llamar socket.join()/socket.leave().
/// Cualquier funcionalidad que necesite unir/sacar un socket de una room pasa
/// por estas funciones, nunca por el socket directamente.
export function joinConversation(socket: AppSocket, conversationId: string): void {
  socket.join(conversationRoomName(conversationId));
}

export function leaveConversation(socket: AppSocket, conversationId: string): void {
  socket.leave(conversationRoomName(conversationId));
}

export function joinUser(socket: AppSocket, userId: string): void {
  socket.join(userRoomName(userId));
}

export function leaveUser(socket: AppSocket, userId: string): void {
  socket.leave(userRoomName(userId));
}

/// Corta todas las conexiones de un usuario (todas sus pestañas y
/// dispositivos): al desactivar su cuenta o revocar sus sesiones
/// (LOCAL_AUTH_PLAN.md, D9). El socket solo se autentica en el handshake: sin
/// esto, una cuenta desactivada seguiría recibiendo mensajes en vivo. Cada
/// socket autenticado se une a su room personal al conectar (presence.socket.ts),
/// así que alcanza con desconectar esa room. `true` cierra la conexión de
/// transporte, no solo el namespace.
export function disconnectUserSockets(io: AppServer, userId: string): void {
  io.in(userRoomName(userId)).disconnectSockets(true);
}

/// Ids de usuario (internos) actualmente conectados a la room de una
/// conversación — quién está "en vivo" para recibir un mensaje ahora mismo
/// (ver `markDelivered` en conversation.service.ts). Único punto autorizado a
/// llamar `fetchSockets()`, por la misma razón que join/leave viven acá:
/// ningún módulo de negocio debe tocar la API de socket.io directamente.
export async function getConnectedUserIds(io: AppServer, conversationId: string): Promise<string[]> {
  const sockets = await io.in(conversationRoomName(conversationId)).fetchSockets();
  const userIds = sockets
    .map((socket) => (socket.data.user as AuthenticatedSocketUser | undefined)?.internalUserId)
    .filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(userIds));
}
