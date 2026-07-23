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

`fileIds` es opcional (adjuntos ya subidos como `StoredFile` — este módulo no sube archivos, ver [`src/storage`](../../storage) cuando exista). Siempre crea un mensaje `type: TEXT`; `type: SYSTEM` está reservado para narrar eventos de la conversación (agregar/quitar miembro, cambio de nombre, etc., ver [backend/README.md](../../../README.md#propósito-de-los-mensajes-de-tipo-system)) — **este módulo todavía no los genera**, es el próximo paso natural una vez `conversations` esté listo para llamarlo.

Además de crear el mensaje, actualiza en la misma transacción `Conversation.lastMessageId`/`lastMessageAt` (el puntero denormalizado que usa `conversations` para ordenar la lista y calcular no leídos) — mantenerlo al día es responsabilidad de quien lo vuelve stale, y eso es este módulo, no `conversations`.

Respuesta `201` con el mensaje, su remitente (`sender: { id, name, email, avatarFileId }`) y sus archivos. Emite `message:created` a la room de la conversación.

### `GET /` — Listar mensajes

Query params: `before` (id de mensaje, cursor) y `limit` (1-100, default 50). Paginación por cursor de Prisma (`cursor: { id }, skip: 1`), más reciente primero internamente — la respuesta llega **en orden cronológico ascendente** (el service invierte el arreglo), lista para renderizar directamente en un hilo de chat. Para cargar mensajes más antiguos, repetir la llamada con `before` = id del mensaje más antiguo ya cargado.

### `PATCH /:id` — Editar

Solo el propio autor (`403` para cualquier otro, incluido el creador de la conversación) y solo mensajes `TEXT` (`400` para `SYSTEM`). Actualiza `editedAt`. Emite `message:updated`.

### `DELETE /:id` — Borrar

Borrado lógico (`deletedAt`, `deletedById`). Permitido para el propio autor **o** el creador de la conversación (mismo criterio que usa `conversations` para expulsar miembros). Emite `message:deleted` con `{ conversationId, messageId }` — el cliente decide cómo representarlo (ej. "mensaje eliminado"), este módulo no reescribe el contenido.

## Auditoría

`SEND_MESSAGE`, `EDIT_MESSAGE`, `DELETE_MESSAGE` en `ChatAuditLog`, con `conversationId` y `messageId`. `CREATE_CONVERSATION`/`ADD_MEMBER`/`REMOVE_MEMBER`/`CHANGE_NAME`/`CHANGE_IMAGE` los escribe `conversations`, no este módulo.

## Eventos de socket

Definidos en `message.socket.ts` (`MESSAGE_EVENTS`). Requieren el mismo handshake autenticado que `conversations` (ver [`src/socket/README.md`](../../socket/README.md#middleware)) y estar unido a la room de la conversación vía `conversation:join` — este módulo no une sockets a ninguna room, solo emite/escucha sobre la room que `conversations` ya gestiona.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `message:created` | servidor → cliente | mensaje completo | A la room de la conversación, al enviarse un mensaje. |
| `message:updated` | servidor → cliente | mensaje completo | Al editarse. |
| `message:deleted` | servidor → cliente | `{ conversationId, messageId }` | Al borrarse. |
| `message:typing_start` | cliente ↔ servidor | `conversationId` (cliente) / `{ conversationId, userId }` (servidor) | Relay efímero — nunca se persiste (ver [backend/README.md](../../../README.md#por-qué-typing-usuario-escribiendo-no-se-almacena-en-la-base-de-datos)). |
| `message:typing_stop` | cliente ↔ servidor | igual que arriba | — |

`typing_start`/`typing_stop` verifican membresía (`isConversationMember`) antes de retransmitir, pero no tocan la base de datos ni quedan en el grafo de auditoría — es estado en memoria puro. Se retransmiten con `socket.to()` (no `io.to()`) para excluir al propio emisor: nadie necesita que le reboten su propio evento de "escribiendo".
