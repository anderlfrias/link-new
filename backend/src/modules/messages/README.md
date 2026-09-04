# Messages

CRUD de mensajes (`Message` en `prisma/schema.prisma`) dentro de una conversación, más los eventos de socket para creación/edición/borrado en tiempo real y el estado efímero de "escribiendo". Ningún mensaje existe fuera de una conversación — este módulo depende de [`conversations`](../conversations/README.md) para la autorización (ver más abajo), no al revés.

## Rutas anidadas bajo `conversations`

Base: `/api/v1/conversations/:conversationId/messages` (montado en `route.ts` **después** de `conversationRoutes`, para que el fallthrough de Express llegue hasta acá — `conversationRoutes` no tiene ninguna ruta que matchee `/:id/messages`).

`message.route.ts` usa `Router({ mergeParams: true })` para poder leer `req.params.conversationId` del prefijo montado. Aplica `authenticate` + `attachInternalUser` igual que `conversations` — cada módulo es autocontenido, no hay middleware "compartido" entre mounts.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Envía un mensaje. |
| `GET` | `/` | Lista mensajes, paginado por cursor. |
| `GET` | `/files` | Archivos compartidos en la conversación, paginado por cursor. |
| `PATCH` | `/:id` | Edita el contenido (solo el propio autor, solo `TEXT`). |
| `DELETE` | `/:id` | Borrado lógico (el autor o el creador de la conversación). |

Todas requieren ser miembro activo de `:conversationId` — se verifica con `assertMembership` (`../conversations/conversation.service.ts`), la misma regla que usa el propio módulo `conversations`. Reutilizarla en vez de duplicarla es la única razón por la que este módulo importa de `conversations`; nada más cruza esa frontera.

### `POST /` — Enviar mensaje

```json
{ "content": "Hola!", "fileIds": ["<storedFileId>"], "replyToId": "<messageId>" }
```

`replyToId` es opcional — responder a un mensaje puntual de la conversación (tipo WhatsApp/Telegram, ver `replyToId`/`replyTo` en `prisma/schema.prisma`). Solo se valida que exista y pertenezca a esta misma conversación (`400` si no) — a propósito **no** se exige que siga sin borrar: el `replyToId` es un puntero fijo que nunca se toca después de crear el mensaje, así que si el original se borra (borrado lógico) más tarde, la cita simplemente empieza a mostrar `"Mensaje eliminado"` la próxima vez que se lea (`replyTo.preview`, calculado en el momento de leer, no guardado). Esto es intencional: si el original se borra justo mientras alguien tenía la cita armada en su composer, el envío no debe fallar por eso.

`fileIds` es opcional (adjuntos ya subidos como `StoredFile` — subidos antes vía [`files`](../files/README.md), este módulo no sube archivos), pero no ilimitado: si `AppSettings.maxFilesPerMessage` no es `null`, `400` cuando `fileIds` trae más entradas que ese límite (ver [`settings`](../settings/README.md#consumidores)) — antes incluso de chequear que esos archivos existan. Siempre crea un mensaje `type: TEXT`; `type: SYSTEM` está reservado para narrar eventos de la conversación (agregar/quitar miembro, cambio de nombre, etc., ver [backend/README.md](../../../README.md#propósito-de-los-mensajes-de-tipo-system)) — **este módulo todavía no los genera**, es el próximo paso natural una vez `conversations` esté listo para llamarlo.

Además de crear el mensaje, actualiza en la misma transacción `Conversation.lastMessageId`/`lastMessageAt`/`lastMessageSenderId` (los punteros denormalizados que usa `conversations` para ordenar la lista, calcular no leídos, y mostrar el estado del último mensaje — ver [Confirmación de entrega y lectura](#confirmación-de-entrega-y-lectura)) — mantenerlos al día es responsabilidad de quien los vuelve stale, y eso es este módulo, no `conversations`.

Respuesta `201` con el mensaje, su remitente (`sender: { id, name, email, avatarFileId }`), sus archivos, `replyTo` (vista resumida del original citado, o `null`), y `receipts` (ver más abajo). Emite `message:created` (con el mismo `receipts`/`replyTo`) a la room de la conversación. `replyTo` sale de `buildLastMessagePreview` (`../conversations/conversation.service.ts`) — el mismo criterio que ya usa la lista de conversaciones y el cuerpo del push, así "Mensaje eliminado"/"📎 Archivo adjunto" nunca queda inconsistente entre pantallas (ver `toReplyPreview` en `message.service.ts`).

`files[].file` es el `StoredFile` completo (no `toStoredFileResponse`, a diferencia de `GET /files` de abajo) — a propósito **sin** filtrar `deletedAt`, tanto acá como en `GET /` y `message:updated`: si un admin borra el archivo después (ver [`files`, "Gestión de storage"](../files/README.md#gestión-de-storage-admin)), el mensaje debe poder seguir mostrando que hubo un adjunto ahí, solo que ya no está disponible, en vez de que desaparezca o rompa la carga — el cliente es quien decide cómo renderizar eso a partir de `file.deletedAt` (ver `frontend/src/features/messages/components/MessageAttachments.tsx`). Contrastar con `GET /files`, que sí filtra `deletedAt: null` (ese panel es "qué hay disponible para ver ahora", no el historial del chat).

### `GET /` — Listar mensajes

Query params: `before` (id de mensaje, cursor) y `limit` (1-100, default 50). Paginación por cursor de Prisma (`cursor: { id }, skip: 1`), más reciente primero internamente — la respuesta llega **en orden cronológico ascendente** (el service invierte el arreglo), lista para renderizar directamente en un hilo de chat. Para cargar mensajes más antiguos, repetir la llamada con `before` = id del mensaje más antiguo ya cargado.

Pedir el historial también marca como **entregados** para quien lo pide todos los mensajes hasta el más nuevo de la página — ver [Confirmación de entrega y lectura](#confirmación-de-entrega-y-lectura).

### `GET /files` — Archivos compartidos

Query params: `before` (id de la entrada `MessageFile`, cursor) y `limit` (1-100, default 50) — misma paginación por cursor que `GET /`, pero el cursor acá es el `id` de la fila `MessageFile`, no el de un mensaje. Junta los adjuntos de todos los mensajes no borrados de la conversación (join contra `MessageFile`/`StoredFile`) sin tener que paginar todo el historial de texto para encontrarlos — pensado para un panel de detalle de la conversación (media/archivos, tipo WhatsApp/Telegram). Cada entrada devuelve la misma forma que `POST /api/v1/files` (`toStoredFileResponse`, reexportada de [`files`](../files/README.md) para no duplicar cómo se arma `url`) más `messageId`/`senderId`.

### `PATCH /:id` — Editar

Solo el propio autor (`403` para cualquier otro, incluido el creador de la conversación) y solo mensajes `TEXT` (`400` para `SYSTEM`). Además, requiere `AppSettings.allowMessageEdit` (`403` si está en `false`) y, si `messageEditTimeLimitMinutes` no es `null`, que no hayan pasado más de esos minutos desde `createdAt` (`403` si venció) — ver [`settings`](../settings/README.md#consumidores). Actualiza `editedAt`. Emite `message:updated` (con `receipts` recalculado).

### `DELETE /:id` — Borrar

Borrado lógico (`deletedAt`, `deletedById`). Permitido para el propio autor **o** el creador de la conversación (mismo criterio que usa `conversations` para expulsar miembros). Cuando quien borra es el propio autor, además requiere `AppSettings.allowMessageDeleteForEveryone` y, si `messageDeleteForEveryoneTimeLimitMinutes` no es `null`, estar dentro de esa ventana desde `createdAt` (mismo mecanismo que editar, ver [`settings`](../settings/README.md#consumidores)) — **el creador de la conversación borrando un mensaje ajeno nunca pasa por estas dos reglas**, es moderación, no autoservicio. Emite `message:deleted` con `{ conversationId, messageId }` — el cliente decide cómo representarlo (ej. "mensaje eliminado"), este módulo no reescribe el contenido.

## Confirmación de entrega y lectura

Cada mensaje devuelto por `POST /`, `GET /` o `PATCH /:id` (y sus equivalentes por socket, `message:created`/`message:updated`) trae un campo `receipts`: un estado por cada miembro de la conversación que **no** sea el autor del mensaje (el autor no necesita un recibo de su propio mensaje).

```json
{
  "id": "<messageId>",
  "content": "Hola!",
  "receipts": [
    { "userId": "<otroMiembro>", "status": "delivered" },
    { "userId": "<otroMiembro2>", "status": "sent" }
  ]
}
```

`status` es uno de `"sent"` (todavía no le llegó a ese miembro), `"delivered"` (le llegó) o `"read"` (lo marcó como leído explícitamente). El detalle de cómo se calcula — los punteros `lastReadAt`/`lastDeliveredAt` en `ConversationMember`, y por qué es una aproximación por corte de tiempo y no un registro por mensaje — vive en [`conversations/README.md`](../conversations/README.md#confirmación-de-entrega-y-lectura), porque son datos que pertenecen a ese modelo. Este módulo solo dispara el avance del puntero de entrega en dos momentos:

* **Al enviar** (`sendMessage`): cualquier miembro que ya esté conectado a la room de la conversación en ese instante (`getConnectedUserIds`, `src/socket/rooms.ts`) recibe el mensaje en vivo por `message:created` — eso ES "entregado", así que su recibo nace en `"delivered"` en vez de `"sent"`.
* **Al listar** (`listMessages`): pedir el historial también cuenta como entrega para quien lo pide, aunque haya estado desconectado — se avanza el puntero hasta el mensaje más nuevo de la página devuelta.

"Leído" nunca lo marca este módulo: sigue siendo una acción explícita del usuario vía `POST /conversations/:id/read` (en `conversations`). Cuando cualquiera de los dos punteros avanza, `conversations` emite `conversation:receipt_updated` a la room — este módulo no reemite un evento propio para eso, para no duplicar la misma notificación por dos canales.

## Auditoría

`SEND_MESSAGE`, `EDIT_MESSAGE`, `DELETE_MESSAGE` en `ChatAuditLog`, con `conversationId` y `messageId`. `CREATE_CONVERSATION`/`ADD_MEMBER`/`REMOVE_MEMBER`/`CHANGE_NAME`/`CHANGE_IMAGE` los escribe `conversations`, no este módulo.

## Eventos de socket

Definidos en `message.socket.ts` (`MESSAGE_EVENTS`). Requieren el mismo handshake autenticado que `conversations` (ver [`src/socket/README.md`](../../socket/README.md#middleware)) y estar unido a la room de la conversación vía `conversation:join` — este módulo no une sockets a ninguna room, solo emite/escucha sobre la room que `conversations` ya gestiona.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `message:created` | servidor → cliente | mensaje completo (con `receipts`) | A la room de la conversación, al enviarse un mensaje. |
| `message:updated` | servidor → cliente | mensaje completo (con `receipts`) | Al editarse. |
| `message:deleted` | servidor → cliente | `{ conversationId, messageId }` | Al borrarse. |
| `message:typing_start` | cliente ↔ servidor | `conversationId` (cliente) / `{ conversationId, userId }` (servidor) | Relay efímero — nunca se persiste (ver [backend/README.md](../../../README.md#por-qué-typing-usuario-escribiendo-no-se-almacena-en-la-base-de-datos)). |
| `message:typing_stop` | cliente ↔ servidor | igual que arriba | — |

`typing_start`/`typing_stop` verifican membresía (`isConversationMember`) antes de retransmitir, pero no tocan la base de datos ni quedan en el grafo de auditoría — es estado en memoria puro. Se retransmiten con `socket.to()` (no `io.to()`) para excluir al propio emisor: nadie necesita que le reboten su propio evento de "escribiendo".

**Limpieza al desconectarse.** `registerMessageSocket` guarda en memoria (por socket, no en ningún lado persistente) el conjunto de conversaciones donde ese socket mandó `typing_start` sin su `typing_stop` correspondiente. Si el socket se cae mientras "escribía" (crash del cliente, cerrar la pestaña, perder la red) — nadie manda `typing_stop`, y sin este cleanup el indicador quedaría pegado en "escribiendo..." para siempre en el resto de los clientes de esa conversación. Por eso, en `SOCKET_LIFECYCLE_EVENTS.DISCONNECTING` (`src/socket/events.ts`) se manda `typing_stop` por cada una de esas conversaciones pendientes. Es `disconnecting`, no `disconnect`: en ese momento el socket todavía pertenece a las rooms, así que `socket.to()` todavía puede emitirle al resto.
