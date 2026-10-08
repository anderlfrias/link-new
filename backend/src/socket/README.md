# Socket.IO — Infraestructura

Esta carpeta contiene únicamente la infraestructura base de comunicación en tiempo real: creación del servidor de sockets, middlewares globales, registro de módulos y manejo de rooms. **No implementa ninguna funcionalidad de chat** (mensajes, conversaciones, presencia, typing, notificaciones, llamadas) — solo deja preparado el mecanismo para que esas funcionalidades se construyan encima sin tocar el núcleo.

Cada módulo de negocio es responsable de sus propios eventos de socket (por ejemplo `message.socket.ts` dentro de `modules/messages`), no de esta carpeta.

## Diagrama de inicialización

```text
Cliente
  ↓
Socket.IO (transporte WebSocket/polling)
  ↓
Gateway            (crea la instancia, la ata al servidor HTTP)
  ↓
Registry           (invoca, por cada conexión, el registrar de cada módulo)
  ↓
Módulos Socket     (message.socket.ts, conversation.socket.ts, presence.socket.ts, ...)
  ↓
Servicios          (lógica de negocio de cada módulo — se implementa en pasos posteriores)
```

## Propósito de cada archivo

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | Tipos compartidos: `AppServer` (alias de `Server` de socket.io), `AppSocket` (alias de `Socket`), `SocketModuleRegistrar` (firma de la función que registra un módulo), `SocketMiddleware` (firma de un middleware de socket) y `AuthenticatedSocketUser` (forma de `socket.data.user` una vez pasó `authenticateSocket`). Ningún otro archivo del proyecto importa tipos de `"socket.io"` directamente — siempre a través de este archivo. |
| `events.ts` | Centraliza únicamente los nombres de los eventos nativos del ciclo de vida de Socket.IO (`connection`, `disconnect`, `disconnecting`, `connect_error`, `error`). Los eventos propios de cada funcionalidad (ej. `message:send`) **no** viven aquí: cada módulo centraliza los suyos en su propio `*.socket.ts`. |
| `rooms.ts` | Único lugar del proyecto autorizado a llamar `socket.join()`/`socket.leave()`. Expone `joinConversation()`, `leaveConversation()`, `joinUser()`, `leaveUser()`, `removeUserFromConversationRoom()` (saca a todas las pestañas de un usuario de la room de una conversación, al quitarlo de un grupo o cuando sale), `disconnectUserSockets()` (corta todas las conexiones de un usuario al desactivar su cuenta o revocar sus sesiones) y los constructores de nombre de room (`conversationRoomName()`, `userRoomName()`). Ningún módulo debe llamar `socket.join()` directamente. |
| `middleware.ts` | Expone `socketMiddlewares` (`authenticateSocket`, `attachSocketContext`) y `applyMiddlewares(io, middlewares)`. Único punto donde se agregan, en este mismo orden, los middlewares de autenticación, autorización, validación, logging y rate limiting — sin modificar `gateway.ts` ni `index.ts`. |
| `request-context.ts` | Vincula el contexto de correlación de logging al socket (`attachSocketContext` adjunta `baseLogger` con `socketId` y metadatos de usuario/IP). Provee el helper `withRequestContext(socket, eventName, fn)` para envolver el manejo de eventos en un `AsyncLocalStorage` con `requestId` único por evento. |
| `socket-auth.middleware.ts` | Autentica el socket contra `socket.handshake.auth.token`: verifica el mismo token que `authenticate` en Express y lo resuelve con la misma función que `attachInternalUser` (`authenticateAccessToken` en `modules/auth/identity.ts`), dejando el resultado en `socket.data.user` (tipo `AuthenticatedSocketUser`, ver `types.ts`). Rechaza cuentas desactivadas, tokens revocados y tokens restringidos a cambiar la contraseña; al cliente le llega `Token expired` o `Invalid token`, los dos mensajes con los que el frontend cierra la sesión. Ningún módulo debe autenticar un socket por su cuenta. |
| `registry.ts` | El sistema de registro centralizado. Expone `registerSocketModule(registrar)` (conecta un registrar al arreglo interno) y `attachSocketModules(io)` (el gateway la invoca una sola vez; por cada conexión nueva ejecuta el registrar de todos los módulos ya registrados). También es el único archivo que importa el `*.socket.ts` de cada módulo. |
| `gateway.ts` | Crea la instancia de Socket.IO (`createSocketGateway(httpServer)`) a partir de un `http.Server` ya existente. No conoce Express en absoluto: recibe cualquier servidor HTTP. Aquí viven las opciones generales (CORS); el logger real de conexiones/desconexiones/errores y un futuro Redis Adapter (para correr varias instancias del servidor) se agregan aquí mismo cuando existan. |
| `index.ts` | Único punto de entrada de todo `src/socket`. `initSocket(httpServer)` crea el gateway, aplica los middlewares y activa el registry; `getIO()` expone la instancia ya inicializada para que el resto del sistema (ej. un servicio que necesite emitir un evento fuera de un request) pueda usarla sin volver a inicializarla. |

## Flujo de inicialización

`server.ts` es el único lugar que conoce tanto a Express como a Socket.IO: crea el `http.Server` explícito con `http.createServer(app)`, se lo pasa a `initSocket()`, y recién después llama `httpServer.listen(PORT)`. `app.ts` no importa nada de `src/socket` — Express y Socket.IO quedan completamente desacoplados.

## Cómo registrar un módulo nuevo

1. Crear `modules/<feature>/<feature>.socket.ts`.
2. Dentro, exportar una función `register<Feature>Socket(socket, io)` con los listeners de esa funcionalidad (misma firma que `SocketModuleRegistrar`):

   ```ts
   import { AppServer, AppSocket } from "../../socket/types";

   export function registerMessageSocket(socket: AppSocket, io: AppServer): void {
     // socket.on("message:send", ...)
   }
   ```

3. En `registry.ts`, importar esa función y registrarla:

   ```ts
   import { registerMessageSocket } from "../modules/messages/message.socket";
   // ...
   registerSocketModule(registerMessageSocket);
   ```

Ningún otro archivo de la infraestructura necesita cambiar. Los módulos `messages` y `conversations` ya existen con esta estructura mínima (sin eventos reales todavía) como ejemplo de referencia. `presence` es la excepción: aunque todavía no emite eventos de presencia real (usuario en línea/desconectado), sí hace algo real en cada conexión — une el socket a su room personal (`joinUser`, ver "Rooms" abajo), que es lo que permite que `conversation:created`/`conversation:updated` lleguen en vivo a un usuario sin importar qué esté mirando.

Nótese que el `*.socket.ts` de cada módulo **no** importa `registry.ts` — solo exporta una función. Es `registry.ts` quien importa a los módulos, nunca al revés. Mantener esta dirección única evita una dependencia circular entre este archivo y cada módulo.

## Cómo registrar eventos nuevos

Cada módulo define y exporta sus propias constantes de evento dentro de su `*.socket.ts` (ej. `export const MESSAGE_EVENTS = { SEND: "message:send" } as const;`), de la misma forma en que `events.ts` centraliza los eventos nativos de Socket.IO. Esto evita strings literales sueltos sin forzar a que todos los módulos compartan (y por lo tanto se acoplen a través de) un único archivo de eventos global.

## Rooms

Las funcionalidades de conversaciones/presencia no manejan nombres de room ni llaman `socket.join()`/`socket.leave()` directamente: siempre pasan por `joinConversation()`, `leaveConversation()`, `joinUser()`, `leaveUser()` de `rooms.ts`. Esto mantiene el formato de nombre de room en un único lugar y evita colisiones o inconsistencias entre módulos.

**La membresía solo se comprueba al unirse** (`conversation:join`). Por eso, cuando un usuario deja de ser miembro (lo quitan del grupo o sale), `removeMember` llama a `removeUserFromConversationRoom()`, que saca a todos sus sockets de la room (se resuelve por su room personal, que incluye todas sus pestañas): sin eso seguiría recibiendo los mensajes nuevos del grupo mientras su conexión siguiera abierta. Hoy es el único camino que revoca una membresía, y cualquier otro que se agregue tiene que hacer lo mismo.

## Middleware

`middleware.ts` expone `applyMiddlewares` y aplica los middlewares globales en orden:
1. `authenticateSocket`: el cliente debe conectarse pasando el token del login en el handshake (la sesión de LINK, el único token que se acepta con cualquier proveedor de autenticación) (`io(url, { auth: { token: "<jwt>" } })`). Si falta el token, expiró o es inválido, la conexión se rechaza (`connect_error` en el cliente) antes de llegar al registry.
2. `attachSocketContext`: una vez autenticado el socket, vincula al socket un logger hijo con metadatos contextuales (`socketId`, `userId`, `ip`, `userAgent`). Para cada evento procesado en un módulo, `withRequestContext(socket, eventName, fn)` inicializa un contexto `AsyncLocalStorage` con `requestId` único, permitiendo correlacionar logs y auditorías disparados en tiempo real.

`authenticateSocket` además programa el corte del socket para cuando venza su token (`session-expiry.ts`, `scheduleSessionExpiry`): el token solo se verifica en el handshake, y sin este temporizador una conexión abierta seguía recibiendo eventos más allá de su sesión. El corte es `socket.disconnect(true)` en el `exp` firmado del token (las sesiones largas, de hasta 30 días, se esperan en tramos por el tope de `setTimeout`); el cliente lo ve como `disconnect` con `reason: "io server disconnect"` y trata la sesión como terminada. Las revocaciones (cuenta desactivada, contraseña cambiada) cortan los sockets por otro camino, `endLiveSessions`.

**Límite de frecuencia de eventos** (`rate-limit.ts`, `registerSocketRateLimit`): `registry.ts` lo registra con `socket.use` en cada socket nuevo, antes de los módulos, así que cubre por igual los eventos de todos. Es un *token bucket* por socket: capacidad de 60 eventos y recarga de 20 por segundo (una ráfaga normal, como el intercambio de candidatos ICE al iniciar una llamada, queda muy por debajo). Un evento por encima del cupo se descarta (el handler no corre) con el error `rate_limited` del lado del servidor, y se avisa en el log como máximo una vez cada 10 s por socket, con el usuario y cuántos eventos se descartaron (nunca el nombre ni el contenido del evento). Los eventos de ciclo de vida (`disconnecting`) no pasan por acá. **No se desconecta al socket que abusa**, a propósito: reconectar le cuesta más al servidor (un handshake con consulta a la base) que descartar el evento, y el cliente oficial toma `io server disconnect` como sesión terminada (ver `session-expiry.ts` y `socket-provider.tsx`), así que una desconexión por abuso se vería como "sesión expirada". Un evento con acknowledgement que se descarta nunca recibe respuesta. El envío de mensajes por HTTP tiene su propio límite (`messageSendRateLimiter`, ver [`messages`](../modules/messages/README.md)).

Cualquier middleware futuro (autorización, validación) se agrega en `socketMiddlewares` sin tocar `gateway.ts` ni `index.ts`.

## Principios usados para desacoplar la infraestructura

* **Inicialización mínima**: `index.ts` solo orquesta (crear, aplicar middlewares, registrar módulos, exponer la instancia); no contiene lógica propia.
* **Gateway ⇄ Express desacoplados**: `gateway.ts` recibe un `http.Server` genérico, nunca la app de Express.
* **Registro sin modificar el núcleo**: nuevos módulos se agregan con un import + una línea de registro en `registry.ts`, sin tocar `gateway.ts` ni `index.ts`.
* **Sin dependencias circulares**: los módulos exportan su función de registro; `registry.ts` los importa y los registra. Nunca al revés.
* **Sin acceso directo a la API de socket.io fuera de `src/socket`**: rooms, tipos y middlewares se consumen siempre a través de la interfaz pública de la infraestructura (`rooms.ts`, `types.ts`, `middleware.ts`), nunca llamando a `socket.join()`/`io.use()` directamente desde un módulo.
* **Preparado para escalar horizontalmente**: agregar un adaptador (Redis Adapter, para correr varias instancias del servidor) es un cambio aislado a `gateway.ts`.
