import { AppSocket } from "./types";

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
