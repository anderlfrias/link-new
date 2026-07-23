/// Nombres de los eventos nativos del ciclo de vida de un socket (Socket.IO ya
/// los emite con estos nombres exactos; centralizarlos evita strings literales
/// repetidos en gateway.ts, registry.ts y en los *.socket.ts de cada módulo).
///
/// Los eventos propios de cada funcionalidad (mensajes, conversaciones,
/// presencia, etc.) NO viven aquí: cada módulo centraliza los suyos en su
/// propio archivo (ej. message.socket.ts), siguiendo el mismo patrón.
export const SOCKET_LIFECYCLE_EVENTS = {
  CONNECTION: "connection",
  DISCONNECT: "disconnect",
  DISCONNECTING: "disconnecting",
  CONNECT_ERROR: "connect_error",
  ERROR: "error",
} as const;
