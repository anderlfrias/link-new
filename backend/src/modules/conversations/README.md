# Conversations

CRUD de conversaciones (`PRIVATE` y `GROUP`) sobre los modelos `Conversation` / `ConversationMember` (`prisma/schema.prisma`), más los eventos de socket para unirse/salir de la room de una conversación en tiempo real. No incluye mensajes (`messages`) ni presencia (`presence`) — cada uno es su propio módulo.

Todas las rutas requieren autenticación y devuelven el `id` **interno** (UUID de la tabla `User`) en cualquier campo `userId`/`memberIds`/etc., nunca el `id` externo de EXTERNAL_AUTH — ver [`internalUserId`](../auth/README.md#respuesta-200) y `attachInternalUser` más abajo.

## Autenticación de las rutas

```
router.use(authenticate, attachInternalUser)
```

`authenticate` (`src/middlewares/auth.middleware.ts`) valida el JWT de EXTERNAL_AUTH, igual que en `auth`. `attachInternalUser` (`src/middlewares/current-user.middleware.ts`) resuelve el `id` interno del usuario a partir de su email y lo agrega a `req.user.internalUserId` — todo este módulo opera exclusivamente con ese id, nunca con el externo de EXTERNAL_AUTH.

## Endpoints

Base: `/api/v1/conversations`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Crea una conversación `PRIVATE` o `GROUP`. |
| `GET` | `/` | Lista las conversaciones del usuario actual, con `unreadCount`. |
| `GET` | `/:id` | Detalle de una conversación (requiere ser miembro). |
| `PATCH` | `/:id` | Renombra o cambia la imagen (solo `GROUP`). |
| `DELETE` | `/:id` | Borrado lógico (solo el creador). |
| `POST` | `/:id/members` | Agrega miembros (solo `GROUP`). |
| `DELETE` | `/:id/members/:userId` | Quita un miembro o sale de la conversación. |
| `POST` | `/:id/read` | Marca la conversación como leída para el usuario actual. |

### `POST /` — Crear conversación

```json
{
  "type": "PRIVATE",
  "memberIds": ["<userId>"]
}
```

* **`PRIVATE`**: `memberIds` debe traer exactamente **un** id (el otro participante; el creador se agrega solo). Si ya existe una conversación `PRIVATE` activa entre ambos, la devuelve tal cual en vez de crear un duplicado — el endpoint es idempotente para este caso.
* **`GROUP`**: requiere `name` y al menos **dos** ids además del creador (más de dos participantes en total, como documenta el enum `ConversationType` en el schema). `imageFileId` es opcional (debe ser el `id` de un `StoredFile` ya existente — subido antes vía [`files`](../files/README.md), este módulo no sube archivos).

Respuesta `201` con la conversación y sus miembros (incluye `user: { id, name, email, avatarFileId, status }` por cada miembro).

**`PRIVATE` sin mensajes todavía no se avisa ni se lista para nadie**: `conversation.service.ts` solo emite `conversation:created` (ver [Eventos de socket](#eventos-de-socket)) cuando `type` es `GROUP` — crear un grupo es una acción explícita con miembros elegidos, así que sí tiene sentido avisarles de una. Una `PRIVATE` recién creada (o encontrada por el chequeo de duplicado de arriba, si todavía no tiene mensajes) queda con `lastMessageId: null`, y `GET /` (abajo) la excluye del listado de **ambos** miembros hasta que se manda el primer mensaje — de otro modo, abrir el perfil de un contacto nuevo le mostraría un chat vacío a la otra persona sin que vos hayas escrito nada. El creador puede seguir usando el `id` de esta respuesta para pedir `GET /:id` o mandar mensajes directamente; en cuanto el primer mensaje se envía, `Conversation.lastMessageId` deja de ser `null` y el `conversation:updated` que ya dispara `POST .../messages` (ver [`messages`](../messages/README.md)) revela la conversación para ambos por igual.

### `GET /` — Listar mis conversaciones

Devuelve las conversaciones donde el usuario es miembro (no borradas), ordenadas por `lastMessageAt` descendente, cada una con `unreadCount` (mensajes de otros usuarios posteriores a `lastReadAt` del miembro actual — sin agregaciones sobre todo el historial, gracias a `lastReadAt`/`lastMessageAt` denormalizados que documenta el [README del backend](../../../README.md#por-qué-existen-lastreadmessageid-en-conversationmember-y-lastmessageat-en-conversation)) y `lastMessageStatus` (ver [Confirmación de entrega y lectura](#confirmación-de-entrega-y-lectura) — `null` si el último mensaje no lo enviaste vos). Excluye las `PRIVATE` con `lastMessageId: null` (ver nota arriba) — `GROUP` aparece siempre, aunque no tenga mensajes.

### `PATCH /:id` — Renombrar / cambiar imagen

```json
{ "name": "Nuevo nombre" }
```

Solo aplica a `GROUP` (`400` en `PRIVATE`). Cualquier miembro puede renombrar o cambiar la imagen — el modelo de datos no tiene roles por miembro, solo `createdById` (ver [Autorización](#autorización)). `imageFileId: null` limpia la imagen del grupo.

### `POST /:id/members` — Agregar miembros

```json
{ "userIds": ["<userId>", "<userId>"] }
```

Solo `GROUP`. Ids ya miembros se ignoran silenciosamente (no es error); si no queda ningún id nuevo, `400`.

### `DELETE /:id/members/:userId`

* Si `:userId` es el propio usuario autenticado: **salir** de la conversación, permitido a cualquier miembro.
* Si es otro usuario: solo el creador de la conversación puede quitarlo (`403` en caso contrario).
* No aplica a `PRIVATE` (`400`): una conversación privada siempre tiene exactamente sus dos miembros originales.

### `DELETE /:id` — Borrar conversación

Borrado lógico (`deletedAt`), solo el creador (`403` para cualquier otro miembro), sin importar el tipo.

### `POST /:id/read`

```json
{ "lastReadMessageId": "<messageId>" }
```

`lastReadMessageId` es opcional: siempre actualiza `lastReadAt` a "ahora"; si se manda, también actualiza el puntero `lastReadMessageId` del miembro.

## Autorización

No hay roles por miembro en el modelo de datos (`ConversationMember` no tiene un campo `role`): la única distinción es `Conversation.createdById`. Por eso:

* Cualquier miembro puede: ver la conversación, renombrarla/cambiar su imagen, agregar miembros, marcarla como leída, y salir de ella.
* Solo el creador puede: quitar a **otro** miembro, o borrar la conversación.

Toda operación primero verifica membresía activa (`403` si el usuario no pertenece a la conversación, `404` si la conversación no existe o está borrada).

## Confirmación de entrega y lectura

Dos punteros denormalizados por miembro (`ConversationMember`), mismo patrón que `lastMessageId`/`lastMessageAt` en `Conversation`:

| Campo | Significa | Quién lo actualiza |
|---|---|---|
| `lastReadAt` / `lastReadMessageId` | El miembro **leyó** explícitamente hasta acá — una acción del usuario. | `POST /:id/read` (este módulo). |
| `lastDeliveredAt` / `lastDeliveredMessageId` | Al miembro **le llegó** el mensaje — en vivo (conectado a la room) o al pedir el historial. Nunca requiere una acción explícita. | `messages`, vía `markDelivered` (exportado desde `conversation.service.ts`; ver [`../messages/README.md`](../messages/README.md#confirmación-de-entrega-y-lectura)). |

"Leído" siempre implica "entregado" (no puedes leer lo que no te llegó), pero no al revés. `computeReceipts(members, message)` (exportada desde `conversation.service.ts`) calcula, para un mensaje y sus destinatarios, el estado de cada uno comparando `message.createdAt` contra `lastReadAt`/`lastDeliveredAt` de cada miembro:

```
message.createdAt <= member.lastReadAt      → "read"
message.createdAt <= member.lastDeliveredAt → "delivered"
si no                                       → "sent"
```

Es una aproximación por corte de tiempo — la misma que ya usa `countUnread` para no leídos — no un registro por mensaje: no distingue "leyó exactamente este mensaje" de "leyó todo hasta un punto posterior a este mensaje". `aggregateReceiptStatus(receipts)` colapsa el arreglo en un solo estado (`"read"` solo si TODOS leyeron, `"delivered"` si todos al menos recibieron, si no `"sent"`) — es lo que usa `GET /conversations` para `lastMessageStatus`.

`messages` es quien dispara `markDelivered` (al enviar, para destinatarios ya conectados; al pedir el historial, para quien lo pide) porque es quien sabe cuándo un mensaje efectivamente llegó a alguien — este módulo solo posee el dato (`ConversationMember`) y la regla de cómo combinarlo en un estado.

## Auditoría

Cada operación que cambia el estado de una conversación escribe un `ChatAuditLog` (`CREATE_CONVERSATION`, `ADD_MEMBER`, `REMOVE_MEMBER`, `CHANGE_NAME`, `CHANGE_IMAGE`), con el `userId` de quien la ejecutó. `SEND_MESSAGE`/`EDIT_MESSAGE`/`DELETE_MESSAGE` los escribirá el módulo `messages`, no este.

## Eventos de socket

Definidos en `conversation.socket.ts` (`CONVERSATION_EVENTS`). El cliente debe autenticarse en el handshake (`io(url, { auth: { token } })`, ver [`src/socket/README.md`](../../socket/README.md#middleware)) antes de poder unirse a ninguna room.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `conversation:join` | cliente → servidor | `conversationId`, ack | Une el socket a la room de esa conversación, **solo si el usuario autenticado es miembro** (se verifica en cada llamada). |
| `conversation:leave` | cliente → servidor | `conversationId`, ack | Saca el socket de la room. |
| `conversation:created` | servidor → cliente | conversación completa | A la room personal (`user:<internalUserId>`) de cada miembro, al agregarlo a una `GROUP` (existente o recién creada). Una `PRIVATE` recién creada **no** emite esto mientras no tenga mensajes — ver nota en `POST /` arriba. |
| `conversation:updated` | servidor → cliente | conversación completa (rename/imagen) o `{ conversationId }` (mensaje nuevo/editado/borrado) | Rename/cambio de imagen: a la room de la conversación (`conversation:<id>`). Mensaje nuevo/editado/borrado que sea el último de la conversación: a la room personal de cada miembro (`notifyConversationListChanged` en `messages/message.service.ts`) — así la lista se refresca sola, y es justo lo que revela una `PRIVATE` la primera vez que se manda un mensaje. |
| `conversation:member_added` | servidor → cliente | `{ conversationId, userIds }` | A la room de la conversación. |
| `conversation:member_removed` | servidor → cliente | `{ conversationId, userId }` | A la room de la conversación. |
| `conversation:deleted` | servidor → cliente | `{ conversationId }` | A la room de la conversación. |
| `conversation:receipt_updated` | servidor → cliente | `{ conversationId, userId, kind: "read"\|"delivered", messageId, at }` | A la room de la conversación, cuando el `lastRead*`/`lastDelivered*` de `userId` avanza (`POST /:id/read`, o `markDelivered` desde `messages`). Solo se emite si el puntero realmente cambió — no en cada fetch que no aporta nada nuevo. |

El servicio (`conversation.service.ts`) emite estos eventos directamente con `getIO()` — no pasan por el registry de sockets, porque no son eventos que un socket dispare sobre sí mismo sino notificaciones que dispara la capa HTTP hacia todos los sockets conectados relevantes.

Un socket **no** se une automáticamente a las rooms de sus conversaciones al conectarse: el cliente debe emitir `conversation:join` por cada conversación que tenga abierta (o vaya a escuchar), y `conversation:leave` al cerrarla. Esto evita que cada conexión reciba tráfico de conversaciones que el usuario no está viendo activamente.
