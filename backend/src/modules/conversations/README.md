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
* **`GROUP`**: requiere `name` y al menos **dos** ids además del creador (más de dos participantes en total, como documenta el enum `ConversationType` en el schema). `imageFileId` es opcional (debe ser el `id` de un `StoredFile` ya existente; este módulo no sube archivos, ver [`src/storage`](../../storage) cuando exista).

Respuesta `201` con la conversación y sus miembros (incluye `user: { id, name, email, avatarFileId, status }` por cada miembro). Emite `conversation:created` (ver [Eventos de socket](#eventos-de-socket)) a la room personal de cada miembro.

### `GET /` — Listar mis conversaciones

Devuelve las conversaciones donde el usuario es miembro (no borradas), ordenadas por `lastMessageAt` descendente, cada una con `unreadCount` (mensajes de otros usuarios posteriores a `lastReadAt` del miembro actual — sin agregaciones sobre todo el historial, gracias a `lastReadAt`/`lastMessageAt` denormalizados que documenta el [README del backend](../../../README.md#por-qué-existen-lastreadmessageid-en-conversationmember-y-lastmessageat-en-conversation)).

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

## Auditoría

Cada operación que cambia el estado de una conversación escribe un `ChatAuditLog` (`CREATE_CONVERSATION`, `ADD_MEMBER`, `REMOVE_MEMBER`, `CHANGE_NAME`, `CHANGE_IMAGE`), con el `userId` de quien la ejecutó. `SEND_MESSAGE`/`EDIT_MESSAGE`/`DELETE_MESSAGE` los escribirá el módulo `messages`, no este.

## Eventos de socket

Definidos en `conversation.socket.ts` (`CONVERSATION_EVENTS`). El cliente debe autenticarse en el handshake (`io(url, { auth: { token } })`, ver [`src/socket/README.md`](../../socket/README.md#middleware)) antes de poder unirse a ninguna room.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `conversation:join` | cliente → servidor | `conversationId`, ack | Une el socket a la room de esa conversación, **solo si el usuario autenticado es miembro** (se verifica en cada llamada). |
| `conversation:leave` | cliente → servidor | `conversationId`, ack | Saca el socket de la room. |
| `conversation:created` | servidor → cliente | conversación completa | A la room personal (`user:<internalUserId>`) de cada miembro, al crearse la conversación o al agregarlo a una existente. |
| `conversation:updated` | servidor → cliente | conversación completa | A la room de la conversación (`conversation:<id>`), al renombrarla o cambiar su imagen. |
| `conversation:member_added` | servidor → cliente | `{ conversationId, userIds }` | A la room de la conversación. |
| `conversation:member_removed` | servidor → cliente | `{ conversationId, userId }` | A la room de la conversación. |
| `conversation:deleted` | servidor → cliente | `{ conversationId }` | A la room de la conversación. |

El servicio (`conversation.service.ts`) emite estos eventos directamente con `getIO()` — no pasan por el registry de sockets, porque no son eventos que un socket dispare sobre sí mismo sino notificaciones que dispara la capa HTTP hacia todos los sockets conectados relevantes.

Un socket **no** se une automáticamente a las rooms de sus conversaciones al conectarse: el cliente debe emitir `conversation:join` por cada conversación que tenga abierta (o vaya a escuchar), y `conversation:leave` al cerrarla. Esto evita que cada conexión reciba tráfico de conversaciones que el usuario no está viendo activamente.
