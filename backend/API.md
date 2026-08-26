# API del backend — guía para construir el frontend

Referencia completa de cómo consumir este backend: login, conversaciones, mensajes, adjuntos, tiempo real (sockets), confirmaciones de entrega/lectura e indicador de "escribiendo". Pensada para quien va a construir la interfaz gráfica — no repite el porqué de cada decisión (eso está en el README de cada módulo, linkeado donde corresponde), se enfoca en **qué llamar y qué esperar de vuelta**.

- Base URL HTTP: `http://localhost:4000/api` (el puerto es `PORT` en `.env`, default `4000`)
- Base URL de sockets: `http://localhost:4000` (Socket.IO, mismo host, sin el prefijo `/api`)
- Todo el cuerpo de request/response es JSON, salvo la subida de archivos (`multipart/form-data`)

---

## 0. Flujo mínimo para arrancar

1. `POST /api/v1/auth/login` → guardar `token` y `user.internalUserId`.
2. Conectar el socket con `auth: { token }`.
3. `GET /api/v1/conversations` → pintar la lista.
4. Al abrir una conversación: emitir `conversation:join`, después `GET /api/v1/conversations/:id/messages` para el historial.
5. Enviar mensajes con `POST /api/v1/conversations/:id/messages`; los mensajes de otros llegan por el evento de socket `message:created` (no hace falta refrescar).
6. Al cerrar una conversación: emitir `conversation:leave`.

Todo lo demás (adjuntos, recibos, "escribiendo...", editar/borrar, grupos) se apoya en este mismo esqueleto.

---

## 1. Convenciones generales

### Autenticación HTTP

Todas las rutas salvo `POST /api/v1/auth/login` requieren:

```
Authorization: Bearer <token>
```

El `token` es exactamente el que devuelve el login (emitido por EXTERNAL_AUTH, el backend nunca emite el suyo propio). Expira según su propio `exp` — no hay refresh token; cuando expira, el backend responde `401 Token expired` y hay que loguear de nuevo.

### Ids: interno vs externo

Cualquier `userId` que aparezca en request o response de este API (`memberIds`, `senderId`, `createdById`, `userId` en un evento de socket, etc.) es el **id interno** (UUID de la tabla `User` local) — `user.internalUserId` en la respuesta del login. **Nunca** es el id externo de EXTERNAL_AUTH (`user.id`). Guardar `internalUserId` como "mi id" en el estado del frontend desde el login.

### Formato de error

Cualquier error (HTTP) responde:

```json
{ "error": "mensaje legible" }
```

con el status code correspondiente:

| Status | Cuándo |
|---|---|
| `400` | Body/query inválido, o una regla de negocio no se cumple (ej. crear un grupo sin `name`) |
| `401` | Falta el token, es inválido, o expiró |
| `403` | Token válido, pero no autorizado para esa acción (ej. no sos miembro, o no sos el creador) |
| `404` | El recurso no existe o está borrado lógicamente |
| `503` | EXTERNAL_AUTH (el servicio de autenticación externo) no respondió, solo en `/auth/login` |

### Fechas

Todas las fechas (`createdAt`, `lastReadAt`, `at` en eventos, etc.) son strings ISO 8601 UTC, tal como Prisma/JSON las serializa.

### Paginación

`GET .../messages` (sección 4.2), `GET .../messages/files` (sección 6.4) y `GET /admin/files` (sección 13.1) paginan por cursor — el resto de los listados (conversaciones, miembros) no pagina porque en la práctica son chicos.

---

## 2. Autenticación

### `POST /api/v1/auth/login`

Reenvía las credenciales al microservicio EXTERNAL_AUTH; no hay usuarios ni contraseñas propias de este backend.

Request (JSON o `application/x-www-form-urlencoded`):
```json
{ "user": "jdoe", "password": "secreto" }
```

Response `200`:
```json
{
  "token": "<jwt emitido por EXTERNAL_AUTH, reenviado tal cual>",
  "user": {
    "id": "<id externo en EXTERNAL_AUTH — NO USAR para relacionar nada>",
    "email": "jdoe@empresa.com",
    "username": "jdoe",
    "fullName": "Juan Doe Pérez",
    "roles": ["admin"],
    "permissions": ["chat.read", "chat.write"],
    "app": "chat-interno",
    "exp": 1735000000,
    "internalUserId": "<uuid interno — este es "mi id" para todo lo demás>"
  }
}
```

Errores: `400` (falta `user`/`password`), `401` (credenciales inválidas o token expirado en llamadas posteriores), `403` (el usuario existe en EXTERNAL_AUTH pero no tiene acceso a esta app), `503` (EXTERNAL_AUTH caído o no responde en 5s), y rate limit propio: `429` tras 10 intentos en 15 minutos desde la misma IP.

Después del login, todo el resto del API (HTTP y socket) usa el mismo `token` — no hay un endpoint de logout ni de refresh; "cerrar sesión" en el frontend es simplemente descartar el token guardado y desconectar el socket.

**`user.fullName` sale de la base local, no del JWT de EXTERNAL_AUTH tal cual.** Nombre y foto de perfil son locales a partir de que el usuario los edita acá (ver "Perfil: nombre y foto" abajo) — `User.syncProfileWithIntegration` (default `true`) controla si el login todavía los sincroniza desde EXTERNAL_AUTH; se apaga solo la primera vez que el usuario cambia cualquiera de los dos. Mientras esté apagado, `fullName` en esta respuesta es siempre el nombre guardado acá, aunque el JWT de EXTERNAL_AUTH diga otra cosa.

### Perfil: nombre y foto

```
PATCH  /api/v1/auth/profile          { "name": "Nuevo Nombre" }
GET    /api/v1/auth/profile/picture
PUT    /api/v1/auth/profile/picture  (multipart/form-data, campo "file")
DELETE /api/v1/auth/profile/picture
```

Los cuatro requieren `Authorization: Bearer <token>`. **Ninguno se relaciona con EXTERNAL_AUTH (ni con ningún otro proveedor de identidad) — son 100% locales.** `PATCH`/`PUT`/`DELETE` apagan `User.syncProfileWithIntegration` para ese usuario (una sola vez alcanza; no hace falta repetirlo en cada edición). A partir de ahí, ni el login ni la sincronización de contactos vuelven a pisar ese nombre/foto.

```js
// Cambiar el nombre
await fetch("http://localhost:4000/api/v1/auth/profile", {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Nuevo Nombre" }),
}); // 200 { "name": "Nuevo Nombre" }

// Ver mi propia foto
const response = await fetch("http://localhost:4000/api/v1/auth/profile/picture", {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await response.blob(); // fetch sigue el 302 solo — ver nota abajo
const url = URL.createObjectURL(blob);

// Cambiar mi foto
const form = new FormData();
form.append("file", fileOrBlob); // File de un <input type="file"> o un Blob (ej. avatar generado, ya rasterizado a PNG)
await fetch("http://localhost:4000/api/v1/auth/profile/picture", {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
}); // 200 { id, originalName, mimeType, extension, size, url, createdAt } — misma forma que POST /api/v1/files (sección 9)

// Quitar mi foto (vuelve a mostrar iniciales)
await fetch("http://localhost:4000/api/v1/auth/profile/picture", {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token}` },
}); // 204
```

`GET` responde `302` a `/uploads/<path del StoredFile>` (mismo archivo estático que sirve el avatar de cualquier otro usuario) — `fetch()` lo sigue solo, así que `.blob()` sigue funcionando igual que antes. `404` si todavía no hay ninguna foto cacheada (nunca inició sesión con una, o ya la sacó).

`name`: 1-120 caracteres, requerido. No importa si la imagen del `PUT` viene de un archivo real o de un avatar generado (ej. Boring Avatars, ver `frontend/src/features/profile`) rasterizado a PNG del lado del cliente — para este endpoint son lo mismo. Errores: `400` (falta el archivo en `PUT`, tipo de imagen no permitido, o `name` vacío/demasiado largo en `PATCH`).

---

## 3. Tiempo real — conectar el socket

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: { token }, // el mismo token del login
});

socket.on("connect_error", (err) => {
  // err.message: "Missing token" | "Invalid token" | "Token expired"
});
```

- La conexión se autentica **una sola vez, en el handshake** (no hay un evento de "login" por socket). Si el token es inválido o expiró, la conexión falla directamente con `connect_error` — no llega a `connect`.
- Reconectar (ej. tras perder la red) vuelve a mandar el mismo `auth.token` automáticamente (comportamiento default de socket.io-client) — si el token ya expiró para ese momento, hay que refrescarlo (re-loguear) antes de reconectar.
- Conectarse **no** te suscribe a nada todavía. Para recibir eventos de una conversación hay que unirse explícitamente a su room (ver 3.1) — esto es intencional, para que un socket no reciba tráfico de conversaciones que el usuario no tiene abiertas.

### 3.1 Unirse/salir de una conversación

| Evento (cliente → servidor) | Payload | Ack |
|---|---|---|
| `conversation:join` | `conversationId` (string) | `{ ok: true }` o `{ ok: false, error }` |
| `conversation:leave` | `conversationId` (string) | `{ ok: true }` |

```js
socket.emit("conversation:join", conversationId, (res) => {
  if (!res.ok) {
    // "Unauthenticated" | "Not a member of this conversation"
  }
});
```

`conversation:join` verifica en cada llamada que el usuario autenticado del socket sea efectivamente miembro de esa conversación (falla con `ok: false` si no). Patrón sugerido: emitir `join` al abrir una conversación en la UI, `leave` al cerrarla/navegar a otra. Los eventos de **mensajes** (`message:*`, incluido "escribiendo") viajan sobre esta misma room — no hace falta unirse a nada aparte para ellos.

### Room personal (`user:<internalUserId>`)

Todo socket autenticado se une automáticamente a su propia room personal apenas conecta (`registerPresenceSocket`, `backend/src/modules/presence/presence.socket.ts`) — no hace falta emitir nada para esto, a diferencia de la room de una conversación (que sí requiere `conversation:join`, ver arriba). Esa room es donde llegan `conversation:created` (al crearse o ser agregado a una conversación) y `conversation:updated` con payload mínimo `{ conversationId }` (cuando cambia el último mensaje de una conversación — ver sección 5), sin importar si el socket está o no unido a la room de esa conversación en particular. Esto es lo que permite que la lista de conversaciones se actualice en vivo aunque no tengas ninguna conversación abierta.

Cuando **vos** creás una conversación o agregás miembros, la respuesta HTTP ya te da los datos completos — no dependas del evento para tu propia acción; el evento es para notificar a **los demás**.

---

## 4. Conversaciones

Base HTTP: `/api/v1/conversations`. Todas requieren `Authorization`.

Forma de una conversación (la misma en todos los endpoints, salvo lo que se aclare):

```json
{
  "id": "conv-uuid",
  "name": "Proyecto X",
  "type": "GROUP",
  "imageFileId": "file-uuid-o-null",
  "imageFile": { "path": "chat/2026/07/....jpg" },
  "createdById": "user-uuid",
  "lastMessageId": "msg-uuid-o-null",
  "lastMessageAt": "2026-07-24T10:00:00.000Z",
  "lastMessageSenderId": "user-uuid-o-null",
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null,
  "members": [
    {
      "id": "membership-uuid",
      "conversationId": "conv-uuid",
      "userId": "user-uuid",
      "joinedAt": "...",
      "lastReadMessageId": "msg-uuid-o-null",
      "lastReadAt": "...-o-null",
      "lastDeliveredMessageId": "msg-uuid-o-null",
      "lastDeliveredAt": "...-o-null",
      "isAdmin": false,
      "isPinned": false,
      "isFavorite": false,
      "user": { "id": "user-uuid", "name": "Juan", "email": "juan@x.com", "avatarFileId": "file-uuid-o-null", "avatarFile": { "path": "avatars/user-uuid/....jpg" }, "status": "ACTIVE" }
    }
  ]
}
```

`type` es `"PRIVATE"` (exactamente 2 miembros fijos) o `"GROUP"` (3 o más). `name`/`imageFileId`/`imageFile` solo aplican a `GROUP`.

`user.avatarFile` viene embebido (igual que los adjuntos de mensajes) para no tener que pedir cada avatar por separado: si no es `null`, construir la URL como `<origin-del-backend>/uploads/<avatarFile.path>` (sin autenticación, igual que cualquier otro `StoredFile` servido por `express.static`). Se cachea automáticamente en cada login de **ese** usuario — ver "Endpoint: foto de perfil" más abajo y `backend/src/modules/files/README.md`.

`imageFile` (imagen del grupo) viene embebido con el mismo criterio que `avatarFile` — `null` si el grupo no tiene foto (o es `PRIVATE`), y si no es `null` se construye la URL igual: `<origin-del-backend>/uploads/<imageFile.path>`.

### 4.1 `POST /` — Crear conversación

```json
{ "type": "PRIVATE", "memberIds": ["<userId-del-otro>"] }
```
```json
{ "type": "GROUP", "memberIds": ["<userId1>", "<userId2>"], "name": "Proyecto X", "imageFileId": "file-uuid" }
```

- `memberIds`: ids **internos** de los demás participantes (no incluyas tu propio id, se agrega solo).
- `PRIVATE`: exactamente 1 id en `memberIds`. Si ya existe una conversación privada activa entre ambos, la devuelve tal cual en vez de crear otra (podés llamarlo sin chequear antes "¿ya existe un chat con este usuario?").
- `GROUP`: requiere `name` y al menos 2 ids en `memberIds` (3+ participantes en total), sin superar el máximo configurado por un admin (`AppSettings.maxGroupMembers`, ver sección 12) — `400` si se excede. Si un admin configuró `whoCanCreateGroups: "APP_ADMINS_ONLY"`, solo un usuario con rol `"admin"` puede crear un `GROUP` (`403` en caso contrario) — ver 4.8. `imageFileId` opcional — debe ser un `id` ya subido vía `POST /api/v1/files` (ver sección 6). El creador queda marcado como admin de ese grupo (`isAdmin: true` en su membresía) — ver 4.9.

→ `201` con la conversación completa.

**`PRIVATE` recién creada (sin mensajes) no aparece para nadie todavía**: no emite `conversation:created` ni sale en `GET /` (para ninguno de los dos miembros) hasta que se manda el primer mensaje — así abrir el perfil de un contacto nuevo no le arma un chat vacío a la otra persona. Vos igual podés seguir usando el `id` que devuelve esta respuesta para pedir `GET /:id` o mandar el primer mensaje directamente; una vez que ese mensaje se envía, la conversación se revela sola para ambos vía el `conversation:updated` que ya dispara toda `POST /messages` (ver 4.2 y sección 6). `GROUP` sí emite `conversation:created` de una — crear un grupo ya es una acción explícita con miembros elegidos, no una simple apertura de contacto.

### 4.2 `GET /` — Listar mis conversaciones

Sin body ni query params. Devuelve un array, cada conversación con cinco campos extra:

```json
{
  "...": "...(todos los campos de arriba)",
  "unreadCount": 3,
  "lastMessageStatus": "delivered",
  "lastMessagePreview": "Nos vemos mañana",
  "isPinnedByMe": false,
  "isFavoritedByMe": false
}
```

- Ordenadas: **fijadas por vos primero** (`isPinnedByMe`), y dentro de cada grupo (fijadas / no fijadas), por `lastMessageAt` descendente (las más recientes primero) — ideal para pintar directo como lista de chats.
- `isPinnedByMe`/`isFavoritedByMe`: preferencias personales tuyas sobre esa conversación, no compartidas con el resto de los miembros — ver 4.10/4.11 más abajo.
- Una `PRIVATE` sin ningún mensaje todavía **no aparece acá** para ninguno de sus dos miembros (ver 4.1) — `GROUP` sí, desde que se crea.
- `unreadCount`: mensajes de otros posteriores a tu `lastReadAt` en esa conversación.
- `lastMessageStatus`: `"sent"` | `"delivered"` | `"read"` | `null`. **Solo tiene un valor si el último mensaje lo enviaste vos** (para pintar el check ✓/✓✓/✓✓azul junto a tu propio último mensaje en la lista); es `null` si el último mensaje es de otra persona, o si la conversación no tiene mensajes todavía. Ver sección 7 para el detalle de qué significa cada estado.
- `lastMessagePreview`: texto del último mensaje, ya resuelto para mostrar en una lista (una sola línea, whitespace colapsado). `"Mensaje eliminado"` si fue borrado, `"📎 Archivo adjunto"` si no tiene texto pero sí adjuntos, `null` si la conversación todavía no tiene mensajes. No arma el prefijo de quién lo mandó (eso es un criterio de presentación del cliente, ej. "Vos: " o "Nombre: " en grupos) — solo el texto del mensaje en sí.
- Enviar/editar/borrar el último mensaje de una conversación (propia o ajena) reemite `conversation:updated` a la room personal (`user:<id>`) de cada miembro, además de los eventos de `message:*` a la room de la conversación — así la lista se refresca sola aunque esa conversación no esté abierta (ver 3.1 y sección 5).

### 4.3 `GET /:id` — Detalle de una conversación

Igual forma que arriba (sin `unreadCount`/`lastMessageStatus`/`lastMessagePreview`, esos son solo del listado). `403` si no sos miembro, `404` si no existe o está borrada.

### 4.4 `PATCH /:id` — Renombrar / cambiar imagen

```json
{ "name": "Nuevo nombre" }
```
```json
{ "imageFileId": null }
```

Al menos uno de los dos campos. Solo `GROUP` (`400` en `PRIVATE`). `imageFileId: null` limpia la imagen. Sujeto a `AppSettings.whoCanChangeGroupInfo` (ver 4.8) — `403` si no tenés permiso. Emite `conversation:updated` (conversación completa) a la room.

### 4.5 `POST /:id/members` — Agregar miembros

```json
{ "userIds": ["<userId1>", "<userId2>"] }
```

Solo `GROUP`. Ids que ya son miembros se ignoran en silencio; si no queda ningún id nuevo, `400`; si el total resultante supera `AppSettings.maxGroupMembers`, `400`. Sujeto a `AppSettings.whoCanAddMembers` (ver 4.8) — `403` si no tenés permiso. Emite `conversation:member_added` `{ conversationId, userIds }` a la room, y `conversation:created` (conversación completa) a la room personal de cada miembro nuevo.

### 4.6 `DELETE /:id/members/:userId` — Quitar miembro / salir

- `:userId` = tu propio id → salir de la conversación, siempre permitido a cualquier miembro, sin importar la configuración.
- `:userId` = otro usuario → sujeto a `AppSettings.whoCanRemoveMembers` (ver 4.8) — `403` si no tenés permiso.
- No aplica a `PRIVATE` (`400` siempre).

→ `200` `{ "conversationId": "...", "userId": "..." }`. Emite `conversation:member_removed` a la room.

### 4.7 `DELETE /:id` — Borrar conversación

Borrado lógico. En `GROUP`, sujeto a `AppSettings.whoCanDeleteGroup` (ver 4.8); en `PRIVATE`, solo el creador (`403` para cualquier otro miembro) — regla histórica, no configurable. → `200` `{ "conversationId": "..." }`. Emite `conversation:deleted` `{ conversationId }`.

### 4.8 Quién puede hacer qué

`createdById` (el creador) y `isAdmin` por membresía (admin de ESE grupo — ver 4.9) son las dos distinciones propias del modelo:

| Acción | Cualquier miembro |
|---|:---:|
| Ver, marcar leído | ✅ |
| Salir (quitarse a sí mismo) | ✅ |

Crear un `GROUP`, agregar/quitar miembros, renombrar/cambiar imagen y borrar el grupo se configuran en runtime vía `AppSettings` (sección 12, `GroupPermissionLevel`: `ALL_MEMBERS` | `GROUP_ADMINS_ONLY` | `APP_ADMINS_ONLY` | `CREATOR_ONLY`):

| Acción | Campo | Default | `ALL_MEMBERS` | `GROUP_ADMINS_ONLY` | `APP_ADMINS_ONLY` | `CREATOR_ONLY` |
|---|---|---|---|---|---|---|
| Crear grupo | `whoCanCreateGroups` | `ALL_MEMBERS` | cualquier usuario | (no aplica) | solo rol `"admin"` | (no aplica) |
| Agregar miembros | `whoCanAddMembers` | `ALL_MEMBERS` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |
| Quitar a otro miembro | `whoCanRemoveMembers` | `CREATOR_ONLY` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |
| Renombrar / cambiar imagen | `whoCanChangeGroupInfo` | `ALL_MEMBERS` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |
| Borrar el grupo | `whoCanDeleteGroup` | `CREATOR_ONLY` | cualquier miembro | solo admins de ese grupo | solo rol `"admin"` | solo el creador |

Los defaults reproducen el comportamiento histórico de cada endpoint — ningún deploy nuevo cambia comportamiento hasta que un admin lo edite. `GROUP_ADMINS_ONLY` (admin de ese grupo puntual, `isAdmin`) y `APP_ADMINS_ONLY` (rol `"admin"` de EXTERNAL_AUTH) son conceptos **distintos** — uno no otorga el otro. Ver [`conversations/README.md`](./src/modules/conversations/README.md#autorización) y [`settings/README.md`](./src/modules/settings/README.md).

### 4.9 Admins de grupo y overrides por grupo

Cada `GROUP` puede tener admins propios (`isAdmin` por membresía), y cada admin de la app puede permitir que las 5 dimensiones de la tabla de arriba (salvo `whoCanCreateGroups`) tengan un valor propio por grupo. Ver [`conversations/README.md#admins-de-grupo`](./src/modules/conversations/README.md#admins-de-grupo) y [`#overrides-por-grupo`](./src/modules/conversations/README.md#overrides-por-grupo) para el detalle completo. Endpoints:

```json
PATCH /:id/members/:userId/admin
{ "isAdmin": true }
```
Solo un admin actual de ese grupo puede promover/degradar a otro miembro; el creador nunca puede ser degradado. → `200 { conversationId, userId, isAdmin }`. Emite `conversation:member_admin_changed`.

```json
GET /:id/settings
→ 200 {
  "conversationId": "...",
  "effective": { "whoCanAddMembers": "...", "whoCanRemoveMembers": "...", "maxGroupMembers": 256, "whoCanChangeGroupInfo": "...", "whoCanDeleteGroup": "..." },
  "overrideAllowed": { "whoCanAddMembers": false, "...": "..." }
}
```
Accesible a cualquier miembro. `effective` ya combina el global con el override del grupo (si tiene uno y está permitido).

```json
PATCH /:id/settings
{ "whoCanAddMembers": "GROUP_ADMINS_ONLY" }
```
Solo admins de ese grupo. `403` si el campo enviado no tiene su `allowGroupOverride*` en `true` en `AppSettings`. → misma forma que el `GET`.

### 4.10 `PATCH /:id/pin` — Fijar/desfijar

```json
{ "isPinned": true }
```
**Self-only**: siempre actúa sobre tu propia membresía, nunca la de otro miembro. Preferencia personal — no la ve nadie más (ver 4.11 y sección 5). → `200` con la fila `ConversationMember` actualizada. Emite `conversation:member_preference_changed` **solo a tu propia room personal**.

### 4.11 `PATCH /:id/favorite` — Marcar/desmarcar favorita

```json
{ "isFavorite": true }
```
Mismo criterio que 4.10 (self-only, privado, mismo evento de socket). → `200` con la fila `ConversationMember` actualizada.

---

## 5. Recibos y eventos de socket de conversación

| Evento | Dirección | Payload | Cuándo |
|---|---|---|---|
| `conversation:join` | cliente → servidor | `conversationId`, con ack | Unirse a la room (ver 3.1) |
| `conversation:leave` | cliente → servidor | `conversationId`, con ack | Salir de la room |
| `conversation:created` | servidor → cliente | conversación completa | A la room personal de cada miembro, al crearse o al ser agregado (ver 3.1) |
| `conversation:updated` | servidor → cliente | conversación completa, o `{ conversationId }` | Al renombrarse/cambiar imagen (room de la conversación); o cuando cambia el último mensaje — se envía, se edita o se borra el mensaje que era el último (a la room personal de cada miembro, **sin necesitar `join`** — igual que `created`, así la lista de conversaciones se refresca aunque esa conversación no esté abierta) |
| `conversation:member_added` | servidor → cliente | `{ conversationId, userIds }` | Al agregar miembros |
| `conversation:member_removed` | servidor → cliente | `{ conversationId, userId }` | Al quitar/salir un miembro |
| `conversation:member_admin_changed` | servidor → cliente | `{ conversationId, userId, isAdmin }` | Al promover/degradar a un admin de grupo (ver 4.9) |
| `conversation:member_preference_changed` | servidor → cliente | `{ conversationId, isPinned, isFavorite }` | Al fijar/favoritear (ver 4.10/4.11) — **solo a tu propia room personal**, nunca a la room de la conversación (es privado, no lo ve el resto de los miembros) |
| `conversation:deleted` | servidor → cliente | `{ conversationId }` | Al borrarse |
| `conversation:receipt_updated` | servidor → cliente | `{ conversationId, userId, kind: "read"\|"delivered", messageId, at }` | Cuando `userId` leyó o recibió mensajes — ver sección 7 |

Salvo `created` y el caso de "cambió el último mensaje" arriba, todos llegan por la room de la conversación — necesitás haber hecho `conversation:join` primero. El cliente no necesita distinguir la forma del payload de `updated`: alcanza con volver a pedir `GET /api/v1/conversations` (ver `frontend/src/features/conversations/hooks/use-conversations.ts`, que ya hace exactamente eso para cualquier evento de esta tabla).

---

## 6. Mensajes

Base HTTP: `/api/v1/conversations/:conversationId/messages`. Requiere ser miembro activo de `:conversationId` (mismas reglas que en la sección 4).

Forma de un mensaje:

```json
{
  "id": "msg-uuid",
  "conversationId": "conv-uuid",
  "senderId": "user-uuid",
  "type": "TEXT",
  "content": "Hola!",
  "editedAt": null,
  "deletedAt": null,
  "deletedById": null,
  "createdAt": "2026-07-24T10:00:00.000Z",
  "sender": { "id": "user-uuid", "name": "Juan", "email": "juan@x.com", "avatarFileId": null },
  "files": [
    { "id": "messagefile-uuid", "messageId": "msg-uuid", "fileId": "file-uuid", "createdAt": "...",
      "file": { "id": "file-uuid", "originalName": "foto.jpg", "mimeType": "image/jpeg", "path": "chat/....jpg", "extension": "jpg", "size": 245678, "provider": "LOCAL", "checksum": "...", "createdById": "user-uuid", "createdAt": "...", "deletedAt": null } }
  ],
  "receipts": [
    { "userId": "otro-user-uuid", "status": "delivered" }
  ]
}
```

`type` es `"TEXT"` (lo único que este API genera hoy) o `"SYSTEM"` (reservado para narrar eventos de la conversación — todavía no se genera automáticamente). `receipts` trae un estado por cada miembro que **no** sea el autor — ver sección 7.

Nota sobre `files[].file`: acá sí vienen `path`/`storedName` tal cual están en la base (a diferencia de la respuesta de `POST /api/v1/files`, que devuelve `url` ya armada) — para armar la URL de descarga desde acá, prefijá `path` con `/uploads/`, ej. `http://localhost:4000/uploads/chat/....jpg`. Si `deletedAt` no es `null`, el archivo fue eliminado (ver sección 13.2) — el contenido ya no existe, pero el resto de los campos (`originalName`, `size`, etc.) siguen siendo válidos para mostrar un placeholder tipo "archivo eliminado" en vez de intentar cargarlo.

### 6.1 `POST /` — Enviar mensaje

```json
{ "content": "Hola!", "fileIds": ["<storedFileId>"] }
```

`content`: 0-4000 caracteres — opcional si mandás `fileIds` (podés mandar un adjunto sin epígrafe, igual que WhatsApp/Telegram), pero el mensaje necesita al menos uno de los dos (`400` si mandás ambos vacíos). `fileIds` opcional — ids de archivos ya subidos vía `POST /api/v1/files` (sección 9).

→ `201` con el mensaje completo (`receipts` recién nacidos: `"delivered"` para quien ya estaba conectado y unido a la room en ese instante, `"sent"` para el resto). Emite `message:created` (mismo objeto) a la room, y `conversation:updated` a la room personal de cada miembro (ver sección 5) para refrescar la lista de conversaciones.

### 6.2 `GET /` — Listar mensajes

Query params: `?before=<messageId>&limit=<1-100, default 50>`.

- Sin `before`: los `limit` mensajes más recientes.
- Con `before`: los `limit` mensajes inmediatamente anteriores a ese id (para "cargar más arriba" al scrollear).
- La respuesta viene **en orden cronológico ascendente** (el más viejo primero) — lista para pintar directo en un hilo de chat, sin necesidad de invertir el arreglo en el frontend.

Pedir el historial también marca como **entregados** (no leídos) para vos todos los mensajes hasta el más nuevo de la página que recibiste — aunque hayas estado desconectado cuando se enviaron.

### 6.3 `PATCH /:id` — Editar

```json
{ "content": "Texto corregido" }
```

Solo tu propio mensaje (`403` para cualquier otro, incluido el creador de la conversación), y solo `type: "TEXT"` (`400` para `SYSTEM`). Actualiza `editedAt`. Emite `message:updated`, y además `conversation:updated` (sección 5) a cada miembro **solo si** este era el último mensaje de la conversación — así `lastMessagePreview` se refresca en la lista sin recargar la conversación entera al editar un mensaje viejo.

### 6.4 `GET /files` — Archivos compartidos

Query params: `?before=<messageFileId>&limit=<1-100, default 50>` — misma paginación por cursor que `GET /` (6.2), pero acá el cursor es el `id` de la entrada devuelta (no el de un mensaje). Sin `before`: los `limit` más recientes. Pensado para un panel de detalle de la conversación (tipo "Media, links y docs" de WhatsApp/Telegram) sin tener que paginar todo el historial de mensajes para juntar sus adjuntos.

→ `200` con un array, más reciente primero:

```json
[
  {
    "id": "file-uuid",
    "originalName": "foto.jpg",
    "mimeType": "image/jpeg",
    "extension": "jpg",
    "size": 245678,
    "url": "http://localhost:4000/uploads/chat/....jpg",
    "createdAt": "2026-07-24T10:00:00.000Z",
    "messageId": "msg-uuid",
    "senderId": "user-uuid"
  }
]
```

Misma forma que devuelve `POST /api/v1/files` (sección 9) más `messageId`/`senderId` para saber en qué mensaje se compartió y quién lo mandó. Solo incluye archivos de mensajes no borrados (`deletedAt: null`) — si borrás el mensaje, desaparece de acá también, aunque el `StoredFile` en sí no se borre.

### 6.5 `DELETE /:id` — Borrar

Borrado lógico. Permitido para el propio autor **o** el creador de la conversación. → `200` `{ "conversationId": "...", "messageId": "..." }`. Emite `message:deleted` con ese mismo payload — el frontend decide cómo mostrarlo (ej. "mensaje eliminado"); el contenido original no se borra de la respuesta de este endpoint, pero tampoco vuelve a aparecer en `GET /` (queda fuera del listado una vez `deletedAt` está seteado). Igual que en 6.3, emite `conversation:updated` a cada miembro solo si el mensaje borrado era el último de la conversación.

### 6.6 Eventos de socket de mensajes

| Evento | Dirección | Payload | Cuándo |
|---|---|---|---|
| `message:created` | servidor → cliente | mensaje completo (con `receipts`) | Al enviarse |
| `message:updated` | servidor → cliente | mensaje completo (con `receipts`) | Al editarse |
| `message:deleted` | servidor → cliente | `{ conversationId, messageId }` | Al borrarse |

Llegan por la room de la conversación (`conversation:join` primero).

---

## 7. Confirmación de entrega y lectura

Cada mensaje trae `receipts: [{ userId, status }]` — un estado por cada miembro que no sea el autor:

- **`"sent"`** — todavía no le llegó a ese miembro.
- **`"delivered"`** — le llegó (en vivo por socket, o porque pidió el historial).
- **`"read"`** — lo marcó explícitamente como leído.

Es una aproximación por corte de tiempo (¿el mensaje es anterior a mi último "leído"/"recibido"?), no un registro exacto por mensaje — no distingue "leyó justo este" de "leyó todo hasta un punto posterior a este".

### Cómo avanza cada uno

| Quién lo dispara | Qué endpoint/evento | Efecto |
|---|---|---|
| El propio usuario, explícitamente | `POST /api/v1/conversations/:id/read` | Marca **leído** — ver 4 más arriba |
| El backend, automáticamente | Estar conectado y unido a la room al momento de un `message:created` | Marca **entregado** en el acto para quien ya estaba ahí |
| El backend, automáticamente | `GET .../messages` (pedir el historial) | Marca **entregado** hasta el mensaje más nuevo de la página |

"Leído" siempre implica "entregado", nunca al revés. **Nadie marca "leído" automáticamente** — es siempre una llamada explícita a `POST /:id/read` (típicamente al abrir/enfocar una conversación, o al scrollear hasta el final).

### Flujo sugerido para el frontend

1. Al abrir una conversación: `conversation:join`, cargar mensajes (`GET .../messages`), y llamar `POST /:id/read` (sin `lastReadMessageId` para simplemente marcar "leído hasta ahora", o con el id del último mensaje visible).
2. Escuchar `conversation:receipt_updated` mientras la conversación está abierta, para actualizar en vivo los checks de tus propios mensajes enviados (`kind: "read"` o `"delivered"`, con `userId` de quién cambió y `messageId` hasta dónde).
3. En la lista de conversaciones (`GET /api/v1/conversations`), usar `lastMessageStatus` para el check junto al último mensaje, sin necesitar los `receipts` detallados de cada mensaje.

En una conversación grupal, `receipts` trae un estado por cada miembro — el frontend decide cómo agregarlo (ej. "✓✓ azul" un mensaje solo cuando **todos** lo leyeron, que es exactamente el criterio que ya usa `lastMessageStatus` en el listado).

---

## 8. Indicador de "escribiendo"

Estado 100% efímero — nunca se persiste ni queda en ningún historial. Solo por socket, solo mientras la conversación está unida (`conversation:join`).

| Evento | Dirección | Payload |
|---|---|---|
| `message:typing_start` | cliente → servidor | `conversationId` |
| `message:typing_stop` | cliente → servidor | `conversationId` |
| `message:typing_start` | servidor → cliente | `{ conversationId, userId }` |
| `message:typing_stop` | servidor → cliente | `{ conversationId, userId }` |

```js
// Al empezar a tipear (ej. debounced en el input):
socket.emit("message:typing_start", conversationId);
// Al parar de tipear (o tras enviar el mensaje, o tras N segundos sin input):
socket.emit("message:typing_stop", conversationId);

socket.on("message:typing_start", ({ conversationId, userId }) => { /* mostrar "Juan está escribiendo..." */ });
socket.on("message:typing_stop", ({ conversationId, userId }) => { /* ocultarlo */ });
```

Notas:
- El servidor **nunca te reenvía tu propio evento** (no hace falta filtrarlo en el frontend).
- El servidor verifica que seas miembro de la conversación antes de retransmitir; si no, el evento simplemente no se propaga (no da error al cliente).
- Si tu socket se desconecta abruptamente (cerrar pestaña, perder red) mientras estabas "escribiendo", el servidor manda `typing_stop` por vos — no hace falta un timeout del lado del cliente para ese caso, aunque igual es buena práctica tener uno corto (ej. 5s sin nuevo `typing_start`) para el caso normal de "dejó de tipear pero no cerró nada".

---

## 9. Adjuntos (archivos, fotos, etc.)

Un mismo modelo (`StoredFile`) sirve para adjuntos de mensaje, imagen de conversación grupal, y (a futuro) avatar de usuario. Se sube **antes** de usarse — subís el archivo, te dan un `id`, y ese `id` es lo que mandás en `imageFileId` (conversaciones) o `fileIds` (mensajes).

Base HTTP: `/api/v1/files`.

### 9.1 `POST /` — Subir

`multipart/form-data`, campo `file` obligatorio, `conversationId` y `kind` opcionales:

```js
const form = new FormData();
form.append("file", fileBlob);
form.append("conversationId", conversationId); // opcional — ver más abajo
form.append("kind", "voice_note"); // opcional — "file" (default) o "voice_note", ver más abajo
await fetch("http://localhost:4000/api/v1/files", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` }, // NO seteés Content-Type manualmente, el browser arma el boundary
  body: form,
});
```

Sin restricción de tipo de archivo por defecto (subís lo que sea — csv, exe, lo que haga falta), salvo que un admin haya activado un allowlist/blocklist (`AppSettings.fileTypeRestrictionMode`, sección 12) — `400` si el tipo no está permitido. El límite de tamaño (`AppSettings.maxUploadSizeMb`, default **25 MB**, editable por un admin sin redeploy) también da `400` si se excede. Si mandás `conversationId`, además valida que seas miembro de esa conversación — `403` si no lo sos.

`kind: "voice_note"` distingue una nota de voz grabada de un adjunto genérico: exige mime type `audio/*` (`400` si no) y valida la duración real del audio contra `AppSettings.maxVoiceNoteDurationSeconds` (`400` si se excede) — la duración se calcula en el backend a partir del archivo, nunca se confía en un valor mandado por el cliente. No se persiste ningún campo `kind` en la respuesta — el archivo se guarda igual sea cual sea.

`conversationId` **no crea ninguna relación**: solo le dice al backend bajo qué conversación organizar el archivo en disco (`chat/<conversationId>/<yyyy>/<mm>/<uuid>.<ext>`, en vez de todo suelto bajo `chat/`). La relación real la creás después mandando el `id` que te devuelve esto en `fileIds` (mensajes) o `imageFileId` (conversaciones). Si no lo mandás, se guarda igual bajo `chat/<yyyy>/<mm>/<uuid>.<ext>`.

→ `201`:
```json
{
  "id": "file-uuid",
  "originalName": "foto.jpg",
  "mimeType": "image/jpeg",
  "extension": "jpg",
  "size": 245678,
  "url": "/uploads/chat/<conversationId>/2026/07/9f2b3c1a-....jpg",
  "createdAt": "..."
}
```

`url` es relativa al mismo host del backend (no lleva dominio) — armá la URL completa como `${backendBaseUrl}${url}` para mostrar la imagen/descargar el archivo. **Servir el archivo (`GET /uploads/...`) no requiere `Authorization`** — es estático y público una vez que tenés la URL (que incluye un UUID no adivinable). Solo subir/consultar metadata/borrar vía `/api/v1/files` requiere estar logueado.

Si el frontend corre en otro origen que el backend (otro puerto en desarrollo, otro dominio en producción) y vas a mostrar la imagen con un `<img>`, necesitás que `/uploads` responda `Cross-Origin-Resource-Policy: cross-origin` — ya está así en `app.ts` (Helmet lo deja en `same-origin` por defecto para el resto de la API, pero esta ruta lo relaja explícitamente). Sin ese header el navegador bloquea la carga de la imagen aunque el request HTTP haya devuelto `200`.

### 9.2 `GET /:id` — Metadata

Misma forma que la respuesta de subida. `404` si no existe o está borrado.

### 9.3 `DELETE /:id`

Borrado lógico, solo quien lo subió (`403` para cualquier otro). → `200` `{ "id": "..." }`. No borra el archivo físico ni valida si sigue en uso por algún mensaje/conversación — si ya lo referenciaste en un mensaje enviado, ese mensaje muestra un placeholder de "archivo eliminado" en vez del contenido (ver `files[].file.deletedAt`, sección 6). Para borrado físico real (libera espacio), ver `DELETE /admin/files/:id`, sección 13.2 — solo admin.

---

## 10. Referencia de datos (enums)

| Enum | Valores | Dónde aparece |
|---|---|---|
| `ConversationType` | `PRIVATE`, `GROUP` | `Conversation.type` |
| `MessageType` | `TEXT`, `SYSTEM` | `Message.type` |
| `UserStatus` | `ACTIVE`, `INACTIVE` | `ConversationMember.user.status` |
| `MessageReceiptStatus` (no es un enum de Prisma, es propio del API) | `sent`, `delivered`, `read` | `receipts[].status`, `lastMessageStatus` |
| `GroupPermissionLevel` | `ALL_MEMBERS`, `GROUP_ADMINS_ONLY`, `APP_ADMINS_ONLY`, `CREATOR_ONLY` | `AppSettings.whoCanCreateGroups`/`whoCanAddMembers`/`whoCanRemoveMembers`/`whoCanChangeGroupInfo`/`whoCanDeleteGroup`, `ConversationGroupSettings` (mismos campos salvo `whoCanCreateGroups`) |
| `FileTypeRestrictionMode` | `DISABLED`, `ALLOWLIST`, `BLOCKLIST` | `AppSettings.fileTypeRestrictionMode` |

---

## 11. Corriendo el backend en local

```bash
cd backend
npm install
npm run dev   # ts-node, puerto 4000 por default
```

Variables de entorno requeridas (`.env`, ver `.env.example`): `DATABASE_URL`, `EXTERNAL_AUTH_API_URL`, `APP_CODE_EXTERNAL_AUTH`, `EXTERNAL_AUTH_JWT_SECRET`. Opcionales: `PORT` (default 4000), `MAX_UPLOAD_SIZE_MB` (default 25 — solo usado como valor semilla de `AppSettings.maxUploadSizeMb` en el primer arranque, ver sección 12; después el valor real vive en la base y se edita vía `PATCH /api/v1/admin/settings`).

Para más detalle de arquitectura interna (no necesario para consumir el API, pero útil si algo no se comporta como se documenta acá): [`README.md`](./README.md) (arquitectura general y modelo de datos), y el README de cada módulo — [`auth`](./src/modules/auth/README.md), [`conversations`](./src/modules/conversations/README.md), [`messages`](./src/modules/messages/README.md), [`files`](./src/modules/files/README.md), [`users`](./src/modules/users/README.md), [`settings`](./src/modules/settings/README.md), [`socket`](./src/socket/README.md).

---

## 12. Configuración global (admin)

Base HTTP: `/api/v1`. Configuración de la instalación, editable en runtime — nada de esto requiere redeploy. Ver [`settings/README.md`](./src/modules/settings/README.md) para el detalle completo.

### 12.1 `GET /admin/settings` / `PATCH /admin/settings` — admin

Requieren rol `"admin"` en `roles` (ver sección 2) — `403` si no lo tenés. `GET` devuelve la configuración completa:

```json
{
  "maxUploadSizeMb": 25,
  "fileTypeRestrictionMode": "DISABLED",
  "fileTypeList": [],
  "maxVoiceNoteDurationSeconds": 300,
  "maxGroupMembers": 256,
  "whoCanCreateGroups": "ALL_MEMBERS",
  "whoCanAddMembers": "ALL_MEMBERS",
  "whoCanRemoveMembers": "CREATOR_ONLY",
  "whoCanChangeGroupInfo": "ALL_MEMBERS",
  "whoCanDeleteGroup": "CREATOR_ONLY",
  "allowGroupOverrideAddMembers": false,
  "allowGroupOverrideRemoveMembers": false,
  "allowGroupOverrideMaxGroupMembers": false,
  "allowGroupOverrideChangeGroupInfo": false,
  "allowGroupOverrideDeleteGroup": false,
  "messageRetentionDays": null
}
```

`PATCH` acepta cualquier subconjunto de esos campos (al menos uno) y devuelve el objeto completo actualizado. `messageRetentionDays: null` (default) deshabilita el borrado automático de mensajes — un número de días lo activa. Los `allowGroupOverride*` (default `false` los 5) habilitan que cada `GROUP` fije su propio valor para la dimensión correspondiente, vía `PATCH /conversations/:id/settings` (ver 4.9) — ver [`settings/README.md`](./src/modules/settings/README.md).

### 12.2 `GET /settings/public` — cualquier autenticado

Subconjunto de solo lectura, sin requerir rol admin — lo que un cliente necesita para validar antes de subir un archivo, grabar una nota de voz o crear un grupo:

```json
{ "maxUploadSizeMb": 25, "maxVoiceNoteDurationSeconds": 300, "maxGroupMembers": 256 }
```

---

## 13. Gestión de storage (admin)

Base HTTP: `/api/v1/admin/files`. Requieren rol `"admin"` (ver sección 2) — `403` si no lo tenés. Ver [`files/README.md`, "Gestión de storage (admin)"](./src/modules/files/README.md#gestión-de-storage-admin) para el detalle completo. A diferencia de `/api/v1/files` (sección 9), acá se lista y borra **cualquier** `StoredFile` sin importar quién lo subió ni para qué se usa (avatar, foto de grupo, adjunto) — es la vista de "cuánto espacio ocupa la instalación".

### 13.1 `GET /` — Listar archivos

Query params, todos opcionales: `before` (cursor por id), `limit` (default 50, máx 100), `type` (`"image"` \| `"audio"` \| `"other"`), `uploader` (busca nombre/email), `search` (busca `originalName`), `from`/`to` (rango `createdAt`, ISO date).

```json
{
  "files": [
    {
      "id": "file-uuid", "originalName": "foto.jpg", "mimeType": "image/jpeg", "extension": "jpg",
      "size": 245678, "url": "/uploads/...", "createdAt": "...",
      "createdBy": { "id": "user-uuid", "name": "Ana", "email": "ana@x.com" },
      "usage": { "avatarOfUserCount": 0, "groupImageOfConversationCount": 0, "messageAttachmentCount": 3 }
    }
  ],
  "totalCount": 214,
  "totalSize": 583200123
}
```

`totalCount`/`totalSize` son agregados sobre **todos** los archivos que matchean el filtro, no solo la página actual. `usage` en todo cero = archivo huérfano (nada lo usa).

### 13.2 `DELETE /:id` — Borrar físicamente

**Distinto de `DELETE /api/v1/files/:id`** (sección 9.3, borrado lógico): este SÍ borra el archivo del disco, libera espacio real. La fila de `StoredFile` no se borra, solo queda `deletedAt` seteado (mismo criterio que el borrado lógico) — así cualquier mensaje/avatar/foto de grupo que ya lo referenciaba sigue teniendo nombre/tamaño válidos para mostrar un placeholder. Sin chequeo de dueño — el único gate es el rol admin. → `200` `{ "id": "..." }`.

---

## 14. Gestión de usuarios (admin)

Base HTTP: `/api/v1/admin/users`. Requiere rol `"admin"` (ver sección 2) — `403` si no lo tenés. Ver [`users/README.md`, "Gestión de usuarios (admin)"](./src/modules/users/README.md#gestión-de-usuarios-admin) para el detalle completo. A diferencia de `GET /api/v1/users` (el directorio de contactos para iniciar una conversación — no documentado en secciones aparte acá, ver [`users/README.md`](./src/modules/users/README.md)), muestra **todos** los usuarios (incluido el propio admin, sin filtrar `status`) más cuánto almacenamiento usa cada uno y su actividad.

### 14.1 `GET /` — Listar usuarios

Query params, todos opcionales: `before` (cursor por id), `limit` (default 30, máx 100), `search` (busca en `name`/`email`/`username`).

```json
{
  "users": [
    {
      "id": "user-uuid", "name": "Ana", "email": "ana@x.com", "username": "ana.external-auth",
      "avatarFileId": "file-uuid", "avatarFile": { "path": "avatars/..." },
      "status": "ACTIVE", "syncProfileWithIntegration": true, "createdAt": "...",
      "storage": { "fileCount": 12, "totalSize": 4582001 },
      "activity": { "conversationCount": 8, "messagesSentCount": 340, "groupsAdministeredCount": 1 }
    }
  ],
  "totalCount": 57
}
```

`storage` = archivos activos subidos por ese usuario (bytes + cantidad). `activity.groupsAdministeredCount` = en cuántos `GROUP` es admin de grupo (`ConversationMember.isAdmin`, sección 4.9), no cuántos creó. `syncProfileWithIntegration` = si el perfil sigue sincronizado desde EXTERNAL_AUTH o ya fue editado localmente.

**Esta vista nunca muestra el rol de un usuario** (no hay forma de saberlo salvo para quien está logueado en ese momento — ver `users/README.md` para el porqué). Todo esto es de **solo lectura**: para cambiar nombre, foto o cualquier otro dato de un usuario hay que hacerlo desde EXTERNAL_AUTH, no desde este API.
