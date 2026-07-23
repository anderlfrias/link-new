import { registerConversationSocket } from "../modules/conversations/conversation.socket";
import { registerMessageSocket } from "../modules/messages/message.socket";
import { registerPresenceSocket } from "../modules/presence/presence.socket";
import { SOCKET_LIFECYCLE_EVENTS } from "./events";
import { AppServer, SocketModuleRegistrar } from "./types";

const registrars: SocketModuleRegistrar[] = [];

/// Un módulo del sistema llama esto para conectar su propio *.socket.ts a cada
/// nuevo socket, sin que el registry ni el gateway necesiten conocer nada de
/// ese módulo.
export function registerSocketModule(registrar: SocketModuleRegistrar): void {
  registrars.push(registrar);
}

/// Único punto donde el servidor Socket invoca el registro: por cada conexión
/// nueva, ejecuta el registrar de cada módulo ya registrado.
export function attachSocketModules(io: AppServer): void {
  io.on(SOCKET_LIFECYCLE_EVENTS.CONNECTION, (socket) => {
    registrars.forEach((registrar) => registrar(socket, io));
  });
}

// Agregar un módulo nuevo es un import arriba + una línea de registro aquí —
// nada más en esta infraestructura necesita tocarse. A diferencia de un import
// por efecto secundario, este registro explícito no depende de ningún ciclo
// entre este archivo y el *.socket.ts de cada módulo (los módulos no importan
// registry.ts), así que el orden de los imports nunca puede romperlo.
registerSocketModule(registerMessageSocket);
registerSocketModule(registerConversationSocket);
registerSocketModule(registerPresenceSocket);
