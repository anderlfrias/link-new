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

Solo `GET .../messages` pagina, por cursor (ver sección 4.2) — el resto de los listados (conversaciones, miembros) no pagina porque en la práctica son chicos.

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

### `GET /api/v1/auth/profile/picture`

Proxea `GET /api/v1/profile/picture` de EXTERNAL_AUTH — requiere `Authorization: Bearer <token>`, igual que el resto del API (a diferencia de `/login`, este endpoint sí necesita sesión).

```js
const response = await fetch("http://localhost:4000/api/v1/auth/profile/picture", {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await response.blob();
const url = URL.createObjectURL(blob); // usar como <img src={url}> y hacer URL.revokeObjectURL(url) después
```

→ `200` con la imagen ya como bytes + `Content-Type` correcto (ej. `image/jpeg`), no JSON. `Cache-Control: private, max-age=300` + `Vary: Authorization` para no repetir el proxy en cada render de `<Avatar>` **sin** que la caché HTTP del navegador mezcle la foto de un usuario con la de otro si cierran sesión y entra alguien distinto en la misma pestaña dentro de esos 300s (la caché por URL sola no distingue por token; con `Vary: Authorization` sí).

**Nota interna**: hacia EXTERNAL_AUTH el backend manda `Authorization: <token>` sin `Bearer ` (su controller decodifica el header tal cual con `jwt-decode`, sin recortar prefijo), y EXTERNAL_AUTH responde con el data URI completo en base64 (`"data:image/jpeg;base64,..."`), no bytes crudos — `auth.service.ts` lo parsea y decodifica antes de reenviarlo. Esto solo importa si se está debugueando la llamada al proxy; el cliente de este backend sigue mandando `Bearer <token>` normal.

**EXTERNAL_AUTH identifica al usuario únicamente por el token** (no recibe ningún id) — por eso este endpoint solo puede traer la foto de **quien está autenticado**, nunca la de otro usuario de una conversación. Este backend resuelve eso por otro lado, no llamando de nuevo a EXTERNAL_AUTH: cada usuario cachea su propia foto (como `StoredFile`, en `User.avatarFileId`) la primera vez que **él mismo** inicia sesión, y desde ahí se sirve a cualquiera vía `user.avatarFile` embebido en conversaciones/directorio (ver sección 4 y 9) — nunca pidiéndosela a EXTERNAL_AUTH por un tercero.

Errores: `404` (EXTERNAL_AUTH respondió `USER_NOT_FOUND` o `PROFILE_PICTURE_NOT_FOUND`), `503` (EXTERNAL_AUTH caído, no responde en 5s, o devolvió algo inesperado — incluye el caso de un token inválido, que en EXTERNAL_AUTH rompe el decode y cae a su error genérico).

### `PUT /api/v1/auth/profile/picture` — Cambiar mi foto de perfil

`multipart/form-data` con un único campo `file` (imagen — jpeg/png/gif/webp, máx. 5 MB, más chico que el límite de adjuntos porque EXTERNAL_AUTH la guarda como data URI en un campo de texto, no en storage de archivos).

```js
const form = new FormData();
form.append("file", fileOrBlob); // File de un <input type="file"> o un Blob (ej. un avatar generado, ya rasterizado a PNG)

const response = await fetch("http://localhost:4000/api/v1/auth/profile/picture", {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const stored = await response.json(); // { id, originalName, mimeType, extension, size, url, createdAt }
```

→ `200` con la misma forma que devuelve `POST /api/v1/files` (sección 9) — usá `stored.url` para mostrarla de inmediato sin esperar un refetch. Internamente: primero se sube a EXTERNAL_AUTH (`PUT /v1/profile/picture`, fuente de verdad para cualquier otra app que lea de ahí — mismo data URI en base64 que devuelve el `GET`, en el campo `profilePicture` del body JSON), y solo si eso funciona se cachea localmente (mismo mecanismo que ya usa el login, ver nota del `GET` arriba) para que el resto de los usuarios de este chat la vean sin depender de EXTERNAL_AUTH.

No importa si la imagen viene de un archivo real subido por el usuario o de un avatar generado (ej. Boring Avatars, ver `frontend/src/features/profile`) rasterizado a PNG del lado del cliente — para este endpoint son exactamente lo mismo, un archivo de imagen.

Errores: `400` (falta el archivo, o el tipo de imagen no está permitido), `404`/`503` con el mismo criterio que `GET` de arriba.

### `DELETE /api/v1/auth/profile/picture` — Quitar mi foto de perfil

Sin body. Borra la foto en EXTERNAL_AUTH (`DELETE /v1/profile/picture`) y limpia `User.avatarFileId` localmente — vuelve a mostrar las iniciales por defecto en todos lados.

→ `204` sin body. Errores: `404`/`503` con el mismo criterio que `GET`/`PUT` de arriba.

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
- `GROUP`: requiere `name` y al menos 2 ids en `memberIds` (3+ participantes en total). `imageFileId` opcional — debe ser un `id` ya subido vía `POST /api/v1/files` (ver sección 6).

→ `201` con la conversación completa.

**`PRIVATE` recién creada (sin mensajes) no aparece para nadie todavía**: no emite `conversation:created` ni sale en `GET /` (para ninguno de los dos miembros) hasta que se manda el primer mensaje — así abrir el perfil de un contacto nuevo no le arma un chat vacío a la otra persona. Vos igual podés seguir usando el `id` que devuelve esta respuesta para pedir `GET /:id` o mandar el primer mensaje directamente; una vez que ese mensaje se envía, la conversación se revela sola para ambos vía el `conversation:updated` que ya dispara toda `POST /messages` (ver 4.2 y sección 6). `GROUP` sí emite `conversation:created` de una — crear un grupo ya es una acción explícita con miembros elegidos, no una simple apertura de contacto.

### 4.2 `GET /` — Listar mis conversaciones

Sin body ni query params. Devuelve un array, cada conversación con tres campos extra:

```json
{
  "...": "...(todos los campos de arriba)",
  "unreadCount": 3,
  "lastMessageStatus": "delivered",
  "lastMessagePreview": "Nos vemos mañana"
}
```

- Ordenadas por `lastMessageAt` descendente (las más recientes primero) — ideal para pintar directo como lista de chats.
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

Al menos uno de los dos campos. Solo `GROUP` (`400` en `PRIVATE`). `imageFileId: null` limpia la imagen. Cualquier miembro puede hacerlo (no hay roles por miembro, ver 4.8). Emite `conversation:updated` (conversación completa) a la room.

### 4.5 `POST /:id/members` — Agregar miembros

```json
{ "userIds": ["<userId1>", "<userId2>"] }
```

Solo `GROUP`. Ids que ya son miembros se ignoran en silencio; si no queda ningún id nuevo, `400`. Emite `conversation:member_added` `{ conversationId, userIds }` a la room, y `conversation:created` (conversación completa) a la room personal de cada miembro nuevo.

### 4.6 `DELETE /:id/members/:userId` — Quitar miembro / salir

- `:userId` = tu propio id → salir de la conversación, cualquier miembro puede.
- `:userId` = otro usuario → solo el creador de la conversación puede (`403` si no).
- No aplica a `PRIVATE` (`400` siempre).

→ `200` `{ "conversationId": "...", "userId": "..." }`. Emite `conversation:member_removed` a la room.

### 4.7 `DELETE /:id` — Borrar conversación

Borrado lógico, solo el creador (`403` para cualquier otro miembro), sin importar el tipo. → `200` `{ "conversationId": "..." }`. Emite `conversation:deleted` `{ conversationId }`.

### 4.8 Quién puede hacer qué

No hay roles por miembro en el modelo de datos — la única distinción es `createdById`:

| Acción | Cualquier miembro | Solo el creador |
|---|:---:|:---:|
| Ver, renombrar, cambiar imagen, agregar miembros, marcar leído | ✅ | |
| Salir (quitarse a sí mismo) | ✅ | |
| Quitar a **otro** miembro | | ✅ |
| Borrar la conversación | | ✅ |

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

Nota sobre `files[].file`: acá sí vienen `path`/`storedName` tal cual están en la base (a diferencia de la respuesta de `POST /api/v1/files`, que devuelve `url` ya armada) — para armar la URL de descarga desde acá, prefijá `path` con `/uploads/`, ej. `http://localhost:4000/uploads/chat/....jpg`.

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

`multipart/form-data`, campo `file` obligatorio y `conversationId` opcional:

```js
const form = new FormData();
form.append("file", fileBlob);
form.append("conversationId", conversationId); // opcional — ver más abajo
await fetch("http://localhost:4000/api/v1/files", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` }, // NO seteés Content-Type manualmente, el browser arma el boundary
  body: form,
});
```

Sin restricción de tipo de archivo (subís lo que sea — csv, exe, lo que haga falta). Sí hay límite de tamaño (`MAX_UPLOAD_SIZE_MB`, default **25 MB**) — `400` si lo excede. Si mandás `conversationId`, además valida que seas miembro de esa conversación — `403` si no lo sos.

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

Borrado lógico, solo quien lo subió (`403` para cualquier otro). → `200` `{ "id": "..." }`. No borra el archivo físico ni valida si sigue en uso por algún mensaje/conversación — si ya lo referenciaste en un mensaje enviado, ese mensaje sigue mostrando el archivo con normalidad aunque borres el `StoredFile` lógicamente (la limpieza real es un job pendiente, no afecta lo ya enviado).

---

## 10. Referencia de datos (enums)

| Enum | Valores | Dónde aparece |
|---|---|---|
| `ConversationType` | `PRIVATE`, `GROUP` | `Conversation.type` |
| `MessageType` | `TEXT`, `SYSTEM` | `Message.type` |
| `UserStatus` | `ACTIVE`, `INACTIVE` | `ConversationMember.user.status` |
| `MessageReceiptStatus` (no es un enum de Prisma, es propio del API) | `sent`, `delivered`, `read` | `receipts[].status`, `lastMessageStatus` |

---

## 11. Corriendo el backend en local

```bash
cd backend
npm install
npm run dev   # ts-node, puerto 4000 por default
```

Variables de entorno requeridas (`.env`, ver `.env.example`): `DATABASE_URL`, `EXTERNAL_AUTH_API_URL`, `APP_CODE_EXTERNAL_AUTH`, `EXTERNAL_AUTH_JWT_SECRET`. Opcionales: `PORT` (default 4000), `MAX_UPLOAD_SIZE_MB` (default 25).

Para más detalle de arquitectura interna (no necesario para consumir el API, pero útil si algo no se comporta como se documenta acá): [`README.md`](./README.md) (arquitectura general y modelo de datos), y el README de cada módulo — [`auth`](./src/modules/auth/README.md), [`conversations`](./src/modules/conversations/README.md), [`messages`](./src/modules/messages/README.md), [`files`](./src/modules/files/README.md), [`socket`](./src/socket/README.md).
