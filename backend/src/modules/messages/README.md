# Messages

CRUD de mensajes (`Message` en `prisma/schema.prisma`) dentro de una conversación, más los eventos de socket para creación/edición/borrado en tiempo real y el estado efímero de "escribiendo". Ningún mensaje existe fuera de una conversación — este módulo depende de [`conversations`](../conversations/README.md) para la autorización (ver más abajo), no al revés.

## Rutas anidadas bajo `conversations`

Base: `/api/v1/conversations/:conversationId/messages` (montado en `route.ts` **después** de `conversationRoutes`, para que el fallthrough de Express llegue hasta acá — `conversationRoutes` no tiene ninguna ruta que matchee `/:id/messages`).

`message.route.ts` usa `Router({ mergeParams: true })` para poder leer `req.params.conversationId` del prefijo montado. Aplica `authenticate` + `attachInternalUser` igual que `conversations` — cada módulo es autocontenido, no hay middleware "compartido" entre mounts.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Envía un mensaje. |
| `GET` | `/` | Lista mensajes, paginado por cursor. |
| `PATCH` | `/:id` | Edita el contenido (solo el propio autor, solo `TEXT`). |
| `DELETE` | `/:id` | Borrado lógico (el autor o el creador de la conversación). |

Todas requieren ser miembro activo de `:conversationId` — se verifica con `assertMembership` (`../conversations/conversation.service.ts`), la misma regla que usa el propio módulo `conversations`. Reutilizarla en vez de duplicarla es la única razón por la que este módulo importa de `conversations`; nada más cruza esa frontera.

### `POST /` — Enviar mensaje

```json
{ "content": "Hola!", "fileIds": ["<storedFileId>"] }
```

`fileIds` es opcional (adjuntos ya subidos como `StoredFile` — subidos antes vía [`files`](../files/README.md), este módulo no sube archivos). Siempre crea un mensaje `type: TEXT`; `type: SYSTEM` está reservado para narrar eventos de la conversación (agregar/quitar miembro, cambio de nombre, etc., ver [backend/README.md](../../../README.md#propósito-de-los-mensajes-de-tipo-system)) — **este módulo todavía no los genera**, es el próximo paso natural una vez `conversations` esté listo para llamarlo.

Además de crear el mensaje, actualiza en la misma transacción `Conversation.lastMessageId`/`lastMessageAt`/`lastMessageSenderId` (los punteros denormalizados que usa `conversations` para ordenar la lista, calcular no leídos, y mostrar el estado del último mensaje — ver [Confirmación de entrega y lectura](#confirmación-de-entrega-y-lectura)) — mantenerlos al día es responsabilidad de quien los vuelve stale, y eso es este módulo, no `conversations`.

Respuesta `201` con el mensaje, su remitente (`sender: { id, name, email, avatarFileId }`), sus archivos, y `receipts` (ver más abajo). Emite `message:created` (con el mismo `receipts`) a la room de la conversación.

### `GET /` — Listar mensajes

Query params: `before` (id de mensaje, cursor) y `limit` (1-100, default 50). Paginación por cursor de Prisma (`cursor: { id }, skip: 1`), más reciente primero internamente — la respuesta llega **en orden cronológico ascendente** (el service invierte el arreglo), lista para renderizar directamente en un hilo de chat. Para cargar mensajes más antiguos, repetir la llamada con `before` = id del mensaje más antiguo ya cargado.

Pedir el historial también marca como **entregados** para quien lo pide todos los mensajes hasta el más nuevo de la página — ver [Confirmación de entrega y lectura](#confirmación-de-entrega-y-lectura).

### `PATCH /:id` — Editar

Solo el propio autor (`403` para cualquier otro, incluido el creador de la conversación) y solo mensajes `TEXT` (`400` para `SYSTEM`). Actualiza `editedAt`. Emite `message:updated` (con `receipts` recalculado).

### `DELETE /:id` — Borrar

Borrado lógico (`deletedAt`, `deletedById`). Permitido para el propio autor **o** el creador de la conversación (mismo criterio que usa `conversations` para expulsar miembros). Emite `message:deleted` con `{ conversationId, messageId }` — el cliente decide cómo representarlo (ej. "mensaje eliminado"), este módulo no reescribe el contenido.

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
