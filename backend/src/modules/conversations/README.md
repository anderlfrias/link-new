# Conversations

CRUD de conversaciones (`PRIVATE`, `GROUP` y `SELF`) sobre los modelos `Conversation` / `ConversationMember` (`prisma/schema.prisma`), más los eventos de socket para unirse/salir de la room de una conversación en tiempo real. No incluye mensajes (`messages`) ni presencia (`presence`) — cada uno es su propio módulo.

Todas las rutas requieren autenticación y devuelven el `id` **interno** (UUID de la tabla `User`) en cualquier campo `userId`/`memberIds`/etc., nunca el `id` externo de un proveedor de autenticación — ver [`internalUserId`](../auth/README.md#respuesta-200) y `attachInternalUser` más abajo.

## Autenticación de las rutas

```
router.use(authenticate, attachInternalUser)
```

`authenticate` (`src/middlewares/auth.middleware.ts`) valida la sesión de LINK (el único token que acepta, con cualquier proveedor), igual que en `auth`. `attachInternalUser` (`src/middlewares/current-user.middleware.ts`) resuelve el `id` interno del usuario con `resolveInternalUser` (`modules/auth/identity.ts`: por id, el `sub` de la sesión) y lo agrega a `req.user.internalUserId` — todo este módulo opera exclusivamente con ese id, nunca con el externo.

## Endpoints

Base: `/api/v1/conversations`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/` | Crea una conversación `PRIVATE` o `GROUP`. |
| `POST` | `/self` | Obtiene (o crea) tu conversación `SELF` — "Mensajes guardados". |
| `GET` | `/` | Lista las conversaciones del usuario actual, con `unreadCount`. |
| `GET` | `/:id` | Detalle de una conversación (requiere ser miembro). |
| `PATCH` | `/:id` | Renombra o cambia la imagen (solo `GROUP`). |
| `DELETE` | `/:id` | Borrado lógico. |
| `POST` | `/:id/members` | Agrega miembros (solo `GROUP`). |
| `DELETE` | `/:id/members/:userId` | Quita un miembro o sale de la conversación. |
| `PATCH` | `/:id/members/:userId/admin` | Promueve/degrada a un miembro como admin de ese grupo (solo `GROUP`). |
| `GET` | `/:id/settings` | Configuración efectiva de un grupo (global + override). |
| `PATCH` | `/:id/settings` | Actualiza el override de un grupo (solo admins de ese grupo). |
| `PATCH` | `/:id/pin` | Fija/desfija la conversación — solo para el usuario que llama. |
| `PATCH` | `/:id/favorite` | Marca/desmarca como favorita — solo para el usuario que llama. |
| `POST` | `/:id/read` | Marca la conversación como leída para el usuario actual. |

### `POST /` — Crear conversación

```json
{
  "type": "PRIVATE",
  "memberIds": ["<userId>"]
}
```

* **`PRIVATE`**: `memberIds` debe traer exactamente **un** id (el otro participante; el creador se agrega solo). Si ya existe una conversación `PRIVATE` activa entre ambos, la devuelve tal cual en vez de crear un duplicado — el endpoint es idempotente para este caso.
* **`GROUP`**: requiere `name` y al menos **dos** ids además del creador (más de dos participantes en total, como documenta el enum `ConversationType` en el schema), sin superar `AppSettings.maxGroupMembers` (`400` si se excede). Si `AppSettings.whoCanCreateGroups` es `APP_ADMINS_ONLY`, solo un usuario con rol `"admin"` puede crear un grupo (`403` en caso contrario) — ver [Autorización](#autorización). `imageFileId` es opcional (debe ser el `id` de un `StoredFile` ya existente — subido antes vía [`files`](../files/README.md), este módulo no sube archivos). El creador queda marcado como **admin de ese grupo** (`ConversationMember.isAdmin = true`) — ver [Admins de grupo](#admins-de-grupo).

Respuesta `201` con la conversación y sus miembros (incluye `user: { id, name, email, avatarFileId, status }` por cada miembro).

`type: "SELF"` acá tira `400` — no tiene "otro miembro" que validar, así que no pasa por este flujo genérico. Usar `POST /self` (abajo) en su lugar.

### `POST /self` — Obtener (o crear) tus "Mensajes guardados"

Sin body — es tu id, tomado del token. Idempotente: si ya existe, la devuelve tal cual (desocultándola si la habías "eliminado", mismo criterio que reusar una `PRIVATE` existente); si no, la crea con un único miembro (vos). Respuesta `200` con la misma forma que cualquier conversación (`type: "SELF"`, `members` con una sola entrada).

Una vez que existe, es una conversación como cualquier otra: mandar/editar/borrar/responder mensajes, adjuntos, fijar, marcar favorita, "Eliminar chat" (oculta "para mí", igual que en `PRIVATE`) — nada de eso necesitó ningún cambio, porque ninguno asumía una cantidad fija de miembros. Lo único que no aplica es lo que ya era exclusivo de `GROUP` (`PATCH /:id`, `POST /:id/members`, admins, settings) — esos endpoints ya rechazaban cualquier `type !== "GROUP"` desde antes de que existiera `SELF`, así que quedó cubierto sin tocarlos.

**`PRIVATE` sin mensajes todavía no se avisa ni se lista para nadie**: `conversation.service.ts` solo emite `conversation:created` (ver [Eventos de socket](#eventos-de-socket)) cuando `type` es `GROUP` — crear un grupo es una acción explícita con miembros elegidos, así que sí tiene sentido avisarles de una. Una `PRIVATE` recién creada (o encontrada por el chequeo de duplicado de arriba, si todavía no tiene mensajes) queda con `lastMessageId: null`, y `GET /` (abajo) la excluye del listado de **ambos** miembros hasta que se manda el primer mensaje — de otro modo, abrir el perfil de un contacto nuevo le mostraría un chat vacío a la otra persona sin que vos hayas escrito nada. El creador puede seguir usando el `id` de esta respuesta para pedir `GET /:id` o mandar mensajes directamente; en cuanto el primer mensaje se envía, `Conversation.lastMessageId` deja de ser `null` y el `conversation:updated` que ya dispara `POST .../messages` (ver [`messages`](../messages/README.md)) revela la conversación para ambos por igual.

### `GET /` — Listar mis conversaciones

Devuelve las conversaciones donde el usuario es miembro (no borradas), ordenadas por `lastMessageAt` descendente (con las **fijadas por vos primero** — ver [Fijar y favoritos](#fijar-y-favoritos)), cada una con `unreadCount` (mensajes de otros usuarios posteriores a `lastReadAt` del miembro actual — sin agregaciones sobre todo el historial, gracias a `lastReadAt`/`lastMessageAt` denormalizados que documenta el [README del backend](../../../README.md#por-qué-existen-lastreadmessageidlastmessageat-y-sus-contrapartes-lastdeliveredmessageidlastmessagesenderid)) y `lastMessageStatus` (ver [Confirmación de entrega y lectura](#confirmación-de-entrega-y-lectura) — `null` si el último mensaje no lo enviaste vos). Excluye las `PRIVATE`/`SELF` con `lastMessageId: null` (ver nota arriba) — `GROUP` aparece siempre, aunque no tenga mensajes. Para `SELF` esto es intencional aunque no haya "otra persona" a quien protegerle un chat vacío: `POST /self` de todos modos sigue devolviendo el `id` para poder abrir la conversación directamente (`GET /:id`) y empezar a escribir — la fila recién se lista sola una vez que mandás tu primer mensaje ahí, mismo comportamiento que cualquier `PRIVATE` nueva.

### `PATCH /:id` — Renombrar / cambiar imagen

```json
{ "name": "Nuevo nombre" }
```

Solo aplica a `GROUP` (`400` en `PRIVATE`). Sujeto a `AppSettings.whoCanChangeGroupInfo` (ver [Autorización](#autorización)). `imageFileId: null` limpia la imagen del grupo.

### `POST /:id/members` — Agregar miembros

```json
{ "userIds": ["<userId>", "<userId>"] }
```

Solo `GROUP`. Ids ya miembros se ignoran silenciosamente (no es error); si no queda ningún id nuevo, `400`. Sujeto a `AppSettings.whoCanAddMembers` y `AppSettings.maxGroupMembers` (ver [Autorización](#autorización)).

### `DELETE /:id/members/:userId`

* Si `:userId` es el propio usuario autenticado: **salir** de la conversación ("Salir del grupo" en la UI), permitido a cualquier miembro, sin importar la configuración.
* Si es otro usuario: sujeto a `AppSettings.whoCanRemoveMembers` (ver [Autorización](#autorización)).
* No aplica a `PRIVATE` (`400`): una conversación privada siempre tiene exactamente sus dos miembros originales.
* Borra la fila `ConversationMember` (hard delete, no soft — sin rastro de membresía después). Emite `conversation:member_removed` a la room de la conversación **y** `conversation:updated` a la room personal de cada miembro que era parte de la conversación (incluido el removido) — ver [Eventos de socket](#eventos-de-socket).

### `DELETE /:id` — Borrar conversación

Comportamiento distinto según el tipo — ver [`ConversationMember.hiddenAt`](#eliminar-chat-borrado-para-mí) para el detalle de `PRIVATE`:

* **`GROUP`**: borrado lógico (`Conversation.deletedAt`) para **todos** los miembros. Requiere `AppSettings.allowGroupDelete` en `true` (interruptor maestro — `403` si está en `false`, sin excepción ni siquiera para un admin de la app) y, además, sujeto a `AppSettings.whoCanDeleteGroup` (ver [Autorización](#autorización)). Emite `conversation:deleted` a la room de la conversación **y** `conversation:updated` a la room personal de cada miembro (mismo criterio que `DELETE /:id/members/:userId` de arriba).
* **`PRIVATE`**: **"para mí"** — oculta la conversación solo para quien la borra (`ConversationMember.hiddenAt`), el otro miembro no se entera y conserva la conversación intacta con todo su historial. Cualquier miembro puede hacerlo (ya no hay distinción de creador). Requiere `AppSettings.allowConversationDelete` en `true` (`403` si está en `false`). Emite `conversation:deleted` **solo** a la room personal de quien la borró.

### `PATCH /:id/members/:userId/admin` — Promover/degradar admin de grupo

```json
{ "isAdmin": true }
```

Solo `GROUP`. Solo un admin **actual** de ese grupo puede promover o degradar a otro miembro (`403` en caso contrario). El creador nunca puede ser degradado (`403` si `isAdmin: false` y `:userId` es el creador). Ver [Admins de grupo](#admins-de-grupo). Respuesta `200 { conversationId, userId, isAdmin }`.

### `GET /:id/settings` — Configuración efectiva del grupo

Solo `GROUP`. Accesible a cualquier miembro (transparencia sobre las reglas de su propio grupo, no solo a sus admins). Respuesta:

```json
{
  "conversationId": "<id>",
  "effective": { "whoCanAddMembers": "...", "whoCanRemoveMembers": "...", "maxGroupMembers": 256, "whoCanChangeGroupInfo": "...", "whoCanDeleteGroup": "..." },
  "overrideAllowed": { "whoCanAddMembers": false, "whoCanRemoveMembers": false, "maxGroupMembers": false, "whoCanChangeGroupInfo": false, "whoCanDeleteGroup": false }
}
```

`effective` ya combina el global de `AppSettings` con el override de este grupo (si tiene uno y está permitido) — ver [Overrides por grupo](#overrides-por-grupo). `overrideAllowed` indica, por dimensión, si `AppSettings` permite hoy que este grupo la sobrescriba.

### `PATCH /:id/settings` — Actualizar el override del grupo

```json
{ "whoCanAddMembers": "GROUP_ADMINS_ONLY" }
```

Solo `GROUP`, solo admins de **ese** grupo (`403` en caso contrario). Body: subconjunto parcial de las 5 dimensiones overrideables. Si algún campo enviado no tiene su `allowGroupOverride*` correspondiente en `true` en `AppSettings`, `403` explícito (aunque el campo sea válido en forma) — la autoridad final vive en el servicio, no en el validador. Respuesta: misma forma que `GET /:id/settings`.

### `PATCH /:id/pin` / `PATCH /:id/favorite`

```json
{ "isPinned": true }
```
```json
{ "isFavorite": true }
```

Ver [Fijar y favoritos](#fijar-y-favoritos). Respuesta: la fila `ConversationMember` actualizada del usuario que llama.

### `POST /:id/read`

```json
{ "lastReadMessageId": "<messageId>" }
```

`lastReadMessageId` es opcional: siempre actualiza `lastReadAt` a "ahora"; si se manda, también actualiza el puntero `lastReadMessageId` del miembro.

## Autorización

`Conversation.createdById` (el creador) y `ConversationMember.isAdmin` (admin de ESE grupo — ver [Admins de grupo](#admins-de-grupo)) son las dos distinciones propias del modelo. A partir de eso:

* Cualquier miembro puede siempre: ver la conversación, marcarla como leída, y salir de ella (auto-remoción).
* Crear un grupo, agregar/quitar miembros, renombrar/cambiar imagen, y eliminar el grupo son configurables en runtime por un admin de la app, vía [`AppSettings`](../settings/README.md) (`GroupPermissionLevel`: `ALL_MEMBERS` / `GROUP_ADMINS_ONLY` / `APP_ADMINS_ONLY` / `CREATOR_ONLY`):

  | Acción | Campo | Default | `ALL_MEMBERS` | `GROUP_ADMINS_ONLY` | `APP_ADMINS_ONLY` | `CREATOR_ONLY` |
  |---|---|---|---|---|---|---|
  | Crear grupo | `whoCanCreateGroups` | `ALL_MEMBERS` | cualquier usuario | (no aplica) | solo rol `"admin"` | (no aplica) |
  | Agregar miembros | `whoCanAddMembers` | `ALL_MEMBERS` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |
  | Quitar a otro miembro | `whoCanRemoveMembers` | `CREATOR_ONLY` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |
  | Renombrar / cambiar imagen | `whoCanChangeGroupInfo` | `ALL_MEMBERS` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |
  | Eliminar el grupo | `whoCanDeleteGroup` | `CREATOR_ONLY` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |

  Los defaults de `whoCanRemoveMembers` y `whoCanDeleteGroup` (`CREATOR_ONLY`) y de `whoCanChangeGroupInfo`/`whoCanAddMembers`/`whoCanCreateGroups` (`ALL_MEMBERS`) reproducen el comportamiento histórico de este módulo antes de que cada campo existiera — ningún deploy nuevo cambia comportamiento hasta que un admin lo edite.

  Eliminar el grupo además requiere `AppSettings.allowGroupDelete` en `true` — a diferencia de las 5 dimensiones de la tabla (que gobiernan **quién**), este es un interruptor maestro sobre **si** la acción existe en absoluto: en `false`, nadie puede borrar un `GROUP`, sin importar `whoCanDeleteGroup` ni el rol de quien lo intente. Default `true` (reproduce el comportamiento histórico).

  `GROUP_ADMINS_ONLY` y `APP_ADMINS_ONLY` son conceptos **distintos**: el primero depende de `ConversationMember.isAdmin` (admin de ese grupo puntual), el segundo del rol `"admin"` de la app (`User.roles`: con cuentas locales lo asigna un admin; con un proveedor externo se guarda en cada login a partir de los roles que entrega) — un admin de grupo no obtiene ningún permiso a nivel app, y viceversa.

Toda operación primero verifica membresía activa (`403` si el usuario no pertenece a la conversación, `404` si la conversación no existe o está borrada).

## Admins de grupo

Cada `ConversationMember` tiene un campo `isAdmin` (default `false`), independiente del rol `"admin"` de la app. El creador de un `GROUP` queda marcado `isAdmin: true` al crearse (nunca en `PRIVATE`, donde el campo no tiene significado). Reglas, forzadas en `conversation.service.ts#setMemberAdminStatus`:

* Solo un admin **actual** de ese grupo puede promover o degradar a otro miembro (cualquiera, no solo el creador).
* El creador **nunca** puede ser degradado — invariante de negocio, no solo de UI.
* Promover/degradar a alguien que ya tiene ese estado es rechazado (`400`, no-op).

Cada cambio escribe un `AuditLog` (`SET_GROUP_ADMIN`, `metadata: { memberId, isAdmin }`) y emite `conversation:member_admin_changed` (ver [Eventos de socket](#eventos-de-socket)).

## Eliminar chat (borrado "para mí")

`ConversationMember.hiddenAt` (`DateTime?`, default `null`) oculta una conversación `PRIVATE` solo para el miembro dueño de esa fila — a diferencia de `Conversation.deletedAt` (borrado global, usado por `GROUP`), nunca afecta al otro participante ni borra ningún dato. `GET /` (`listForUser` en `conversation.repository.ts`) filtra por `hiddenAt: null` de la propia membresía del usuario que pide la lista, así que una conversación oculta simplemente deja de listarse para quien la ocultó, sin tocar la fila `Conversation` ni los mensajes.

No existe un endpoint para "desocultar" explícitamente — reaparece sola, sin acción manual, en dos casos:

* **Llega un mensaje nuevo** en esa conversación (de cualquiera de los dos miembros, incluido uno mismo): `messages/message.service.ts#notifyConversationListChanged` limpia `hiddenAt` para todos los miembros antes de emitir `conversation:updated` — así "escribirle de nuevo a alguien que había eliminado" también le desoculta el chat a quien escribe.
* **Se reinicia el chat con ese contacto** (`POST /` de arriba, camino de reuso de `PRIVATE` existente): si quien pide la conversación la tenía oculta, `createConversation` le limpia `hiddenAt` antes de devolverla.

Es idempotente eliminar un chat ya oculto (vuelve a fijar `hiddenAt` a la fecha actual, sin error) y no genera ningún `AuditLog` — es preferencia/estado personal, mismo criterio que [Fijar y favoritos](#fijar-y-favoritos), no una acción sobre la conversación en sí.

## Fijar y favoritos

`ConversationMember.isPinned`/`isFavorite` (ambos default `false`) son **preferencias personales de organización**, no propiedades de la conversación — cada miembro tiene las suyas, independientes de las del resto (fijar un chat no lo fija para nadie más). `GET /` (arriba) ordena las fijadas por el usuario que llama primero — el resto del orden (`lastMessageAt`/`createdAt` desc) se preserva sin cambios dentro de cada grupo (fijadas / no fijadas). Nada de esto se audita en `AuditLog` (ver [Auditoría](#auditoría)) — es preferencia personal, no una acción sobre el grupo.

`PATCH /:id/pin`/`PATCH /:id/favorite` (`conversation.service.ts#setConversationPinned`/`setConversationFavorite`) son **self-only**: siempre actúan sobre la propia membresía de quien llama, nunca sobre otro miembro (a diferencia de `setMemberAdminStatus`). Por eso mismo, el evento de socket (`conversation:member_preference_changed`, ver [Eventos de socket](#eventos-de-socket)) se emite **solo a la room personal** de quien hizo el cambio, nunca a la room de la conversación — filtrarlo ahí expondría esta preferencia privada al resto de los miembros.

## Overrides por grupo

Las 5 dimensiones de la tabla de [Autorización](#autorización) (todas salvo `whoCanCreateGroups`, que es puramente global) pueden tener un valor propio por grupo, si el admin de la app lo habilitó globalmente (`AppSettings.allowGroupOverride*`, ver [`settings`](../settings/README.md)). El override vive en `ConversationGroupSettings` (1:1 opcional con `Conversation`, columnas nullable — `null` = "hereda el global"). `settings.service.ts#resolveEffectiveGroupSettings` combina ambos: si el flag global está apagado, el override guardado se **ignora** (no se borra), y el valor global vuelve a regir apenas se apague el flag. Ver `GET`/`PATCH /:id/settings` arriba.

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

Cada operación que cambia el estado de una conversación escribe un `AuditLog` (`CREATE_CONVERSATION`, `ADD_MEMBER`, `REMOVE_MEMBER`, `CHANGE_NAME`, `CHANGE_IMAGE`, `SET_GROUP_ADMIN`), con el `userId` de quien la ejecutó. `SEND_MESSAGE`/`EDIT_MESSAGE`/`DELETE_MESSAGE` los escribirá el módulo `messages`, no este.

## Eventos de socket

Definidos en `conversation.socket.ts` (`CONVERSATION_EVENTS`). El cliente debe autenticarse en el handshake (`io(url, { auth: { token } })`, ver [`src/socket/README.md`](../../socket/README.md#middleware)) antes de poder unirse a ninguna room.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `conversation:join` | cliente → servidor | `conversationId`, ack | Une el socket a la room de esa conversación, **solo si el usuario autenticado es miembro** (se verifica en cada llamada). |
| `conversation:leave` | cliente → servidor | `conversationId`, ack | Saca el socket de la room. |
| `conversation:created` | servidor → cliente | conversación completa | A la room personal (`user:<internalUserId>`) de cada miembro, al agregarlo a una `GROUP` (existente o recién creada). Una `PRIVATE` recién creada **no** emite esto mientras no tenga mensajes — ver nota en `POST /` arriba. |
| `conversation:updated` | servidor → cliente | conversación completa (rename/imagen) o `{ conversationId }` (mensaje nuevo/editado/borrado) | Rename/cambio de imagen: a la room de la conversación (`conversation:<id>`). Mensaje nuevo/editado/borrado que sea el último de la conversación: a la room personal de cada miembro (`notifyConversationListChanged` en `messages/message.service.ts`) — así la lista se refresca sola, y es justo lo que revela una `PRIVATE` la primera vez que se manda un mensaje. |
| `conversation:member_added` | servidor → cliente | `{ conversationId, userIds }` | A la room de la conversación. |
| `conversation:member_removed` | servidor → cliente | `{ conversationId, userId }` | A la room de la conversación **y** `conversation:updated` a la room personal de cada miembro (incluido el removido) — la mayoría no tiene la conversación abierta, solo la room de arriba no les llegaría. |
| `conversation:member_admin_changed` | servidor → cliente | `{ conversationId, userId, isAdmin }` | A la room de la conversación, cuando `setMemberAdminStatus` promueve/degrada a un miembro — cambia en vivo qué acciones puede hacer, por eso se empuja de inmediato (a diferencia de los cambios de `PATCH /:id/settings`, que no emiten evento). |
| `conversation:member_preference_changed` | servidor → cliente | `{ conversationId, isPinned, isFavorite }` | **Solo** a la room personal (`user:<internalUserId>`) de quien fijó/favoriteó — nunca a la room de la conversación (ver [Fijar y favoritos](#fijar-y-favoritos)). Sincroniza entre pestañas/dispositivos del mismo usuario. |
| `conversation:deleted` | servidor → cliente | `{ conversationId }` | `GROUP`: a la room de la conversación **y** `conversation:updated` a la room personal de cada miembro (mismo motivo que `member_removed`). `PRIVATE`: **solo** a la room personal de quien la eliminó — es un borrado "para mí", el otro miembro no debe enterarse (ver [Eliminar chat](#eliminar-chat-borrado-para-mí)). |
| `conversation:receipt_updated` | servidor → cliente | `{ conversationId, userId, kind: "read"\|"delivered", messageId, at }` | A la room de la conversación, cuando el `lastRead*`/`lastDelivered*` de `userId` avanza (`POST /:id/read`, o `markDelivered` desde `messages`). Solo se emite si el puntero realmente cambió — no en cada fetch que no aporta nada nuevo. |

El servicio (`conversation.service.ts`) emite estos eventos directamente con `getIO()` — no pasan por el registry de sockets, porque no son eventos que un socket dispare sobre sí mismo sino notificaciones que dispara la capa HTTP hacia todos los sockets conectados relevantes.

Un socket **no** se une automáticamente a las rooms de sus conversaciones al conectarse: el cliente debe emitir `conversation:join` por cada conversación que tenga abierta (o vaya a escuchar), y `conversation:leave` al cerrarla. Esto evita que cada conexión reciba tráfico de conversaciones que el usuario no está viendo activamente.
