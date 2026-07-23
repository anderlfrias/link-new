# Backend — Arquitectura

Este documento describe la organización del backend. La arquitectura es **modular (feature-based)**: cada funcionalidad del sistema vive en su propio módulo autocontenido dentro de `src/modules`.

```text
backend/
│
├── prisma/
│
├── src/
│   │
│   ├── config/
│   │
│   ├── modules/
│   │
│   ├── middlewares/
│   │
│   ├── socket/
│   │
│   ├── storage/
│   │
│   ├── workers/
│   │
│   ├── utils/
│   │
│   ├── constants/
│   │
│   ├── types/
│   │
│   ├── app.ts
│   │
│   └── server.ts
│
├── uploads/
│
└── README.md
```

---

## prisma

Contendrá el esquema de Prisma (`schema.prisma`) y las migraciones generadas.

No debe contener lógica de negocio, servicios ni repositorios. Es exclusivamente la definición del modelo de datos y su historial de migraciones.

---

## src/config

Aquí van los archivos de configuración y carga de variables de entorno de la aplicación.

Ejemplos futuros:

* `env.ts` (lectura y validación de variables de entorno)
* `database.ts` (configuración de conexión)
* `cors.ts`
* `socket.config.ts`

---

## src/modules

Toda la funcionalidad del sistema debe vivir aquí. Cada módulo representa una feature del negocio (por ejemplo `messages`, `users`, `auth`) y debe ser lo más **independiente** posible del resto.

Un módulo contendrá únicamente los archivos que realmente necesite, ni uno más.

No se deben crear subcarpetas innecesarias dentro de un módulo.

### Ejemplo de módulo

```text
messages/

├── message.controller.ts

├── message.service.ts

├── message.repository.ts

├── message.routes.ts

├── message.socket.ts

└── message.validator.ts
```

* Si el módulo es pequeño, se mantienen los archivos planos (como en el ejemplo anterior).
* Cuando el módulo crezca, se podrán crear subcarpetas como `dto/`, `validators/`, `interfaces/`, únicamente cuando realmente aporten organización.

---

## src/middlewares

Middlewares globales de Express, compartidos por toda la aplicación (por ejemplo manejo de errores, autenticación transversal, logging de peticiones).

Los middlewares específicos de un módulo deben vivir dentro de ese módulo, no aquí.

---

## src/socket

Contiene únicamente la configuración global de Socket.IO (creación del servidor de sockets, adjuntarlo al servidor HTTP, middlewares globales, registro de módulos, manejo de rooms). No contiene eventos de negocio de ningún módulo — ver [`src/socket/README.md`](./src/socket/README.md) para el detalle completo.

Cada módulo es responsable de registrar sus propios eventos de socket (por ejemplo `message.socket.ts` dentro del módulo `messages`).

---

## src/storage

Esta carpeta **no almacena archivos**.

Aquí viven únicamente los proveedores de almacenamiento (por ejemplo `LocalDiskStorage`, `MinIOStorage`, `S3Storage`) que exponen una interfaz común para guardar y leer archivos, sin importar el backend físico utilizado.

---

## src/workers

Procesos en segundo plano (background jobs), como colas de tareas, cron jobs o procesamiento asíncrono desacoplado del ciclo petición-respuesta.

---

## src/utils

Funciones reutilizables **sin lógica de negocio** (helpers genéricos: formateo de fechas, manejo de strings, utilidades matemáticas, etc.).

---

## src/constants

Constantes globales compartidas por toda la aplicación (por ejemplo códigos de error, valores por defecto, enumeraciones globales).

---

## src/types

Tipos y definiciones TypeScript globales del backend, compartidos entre módulos.

Los tipos específicos de un módulo deben vivir dentro de ese módulo.

---

## uploads

Almacenamiento físico de archivos locales durante el desarrollo, o cuando se utilice almacenamiento en disco (`LocalDiskStorage`) en lugar de un proveedor externo (S3, MinIO, etc.).

---

## Modelos de Datos

El modelo de datos del chat está definido en [`prisma/schema.prisma`](./prisma/schema.prisma). Usa PostgreSQL como base de datos e **incluye el modelo `User`**, que representa el perfil del usuario dentro del chat sin importar quién administre su autenticación (ver [Gestión de Usuarios](#gestión-de-usuarios) y [Proveedor de Autenticación](#proveedor-de-autenticación) más abajo).

### Propósito de cada modelo

* **User** — el perfil del usuario dentro del chat: nombre, email, avatar (`avatarFile` → `StoredFile`) y estado. Existe siempre, sea cual sea el proveedor de autenticación.
* **Conversation** — una conversación privada (2 personas) o grupal (`type: PRIVATE | GROUP`). Guarda su nombre e imagen (`imageFile` → `StoredFile`, solo relevante para grupos) y quién la creó (`createdBy` → `User`).
* **ConversationMember** — la pertenencia de un usuario a una conversación. Es la tabla intermedia entre `User` y `Conversation`: un usuario tiene muchas membresías, una conversación tiene muchos miembros. La combinación `(conversationId, userId)` es única: un usuario no puede pertenecer dos veces a la misma conversación.
* **Message** — un mensaje dentro de una conversación, enviado por un usuario (`sender` → `User`). Puede tener archivos adjuntos (a través de `MessageFile`) y puede aparecer referenciado en el historial de auditoría.
* **StoredFile** — un archivo físico almacenado por el sistema, sin importar quién lo use ni para qué (ver [Gestión de Archivos](#gestión-de-archivos)).
* **MessageFile** — la relación entre un mensaje y un archivo (`StoredFile`) que usa. No duplica información del archivo.
* **ChatAuditLog** — el historial de acciones relevantes del chat (crear conversación, agregar/quitar miembro, enviar/editar/borrar mensaje, cambiar nombre o imagen), con quién la ejecutó (`user` → `User`) y, opcionalmente, sobre qué conversación o mensaje.

### Relaciones principales

* `User` 1—N `Conversation` (como creador), 1—N `ConversationMember`, 1—N `Message` (como remitente y, opcionalmente, como quien borró un mensaje ajeno), 1—N `ChatAuditLog` y 1—N `StoredFile` (como quien lo subió); y N—1 `StoredFile` a través de `avatarFile`.
* `Conversation` 1—N `ConversationMember` y 1—N `Message`; y N—1 `StoredFile` a través de `imageFile`.
* `ConversationMember` N—1 `Conversation` y N—1 `User`.
* `Message` N—1 `Conversation`, N—1 `User` (remitente), 1—N `MessageFile`, y puede tener 0—N `ChatAuditLog` asociados.
* `StoredFile` 1—N `MessageFile`, y puede ser referenciado por 0—N `User.avatarFile` y 0—N `Conversation.imageFile`.
* `MessageFile` N—1 `Message` y N—1 `StoredFile`.
* `ChatAuditLog` referencia opcionalmente a `Conversation` y a `Message`, y siempre a un `User`.

### ¿Por qué existen `lastReadMessageId` (en `ConversationMember`) y `lastMessageAt` (en `Conversation`)?

Son campos **denormalizados**: guardan un dato que técnicamente podría calcularse con una consulta (el último mensaje de una conversación, o el último mensaje que un miembro marcó como leído), pero hacerlo así evitaría tener que agregar/ordenar sobre toda la tabla `Message` cada vez que se necesita listar conversaciones o calcular no leídos. Por eso mismo son campos sueltos (`String`/`DateTime`), sin relación formal de Prisma hacia `Message`: mantenerlos actualizados es responsabilidad de la capa de servicios (que se implementará en un paso posterior), no de la base de datos.

### ¿Por qué "typing" (usuario escribiendo) no se almacena en la base de datos?

El estado de "está escribiendo" es efímero y de muy alta frecuencia (cambia varias veces por segundo mientras alguien teclea) y solo importa mientras la conexión de socket está activa. Persistirlo en PostgreSQL agregaría escrituras constantes sin ningún valor histórico. Este tipo de estado en tiempo real se maneja directamente en memoria a través de Socket.IO (ver `src/socket` y el `*.socket.ts` de cada módulo), no en el modelo de datos.

### Diferencia entre `Message` y `ChatAuditLog`

`Message` es contenido del chat: lo que los usuarios ven en la conversación. `ChatAuditLog` es metadata de auditoría sobre eventos del sistema: quién hizo qué y cuándo (crear la conversación, agregar/quitar un miembro, editar o borrar un mensaje, cambiar el nombre o la imagen del grupo). Un mismo evento puede generar ambas cosas a la vez — por ejemplo, "Juan agregó a Pedro" puede insertarse como un `Message` de tipo `SYSTEM` (para que se vea en el chat) *y* como un `ChatAuditLog` con acción `ADD_MEMBER` (para el historial de auditoría) — pero conceptualmente son cosas distintas: uno es visible para los usuarios, el otro es un registro interno.

### Propósito de los mensajes de tipo `SYSTEM`

Son mensajes generados por el propio sistema, no escritos por un usuario, para narrar eventos dentro del hilo de la conversación (por ejemplo "Juan agregó a Pedro", "María cambió el nombre del grupo"). Se guardan como `Message` normales (con `type: SYSTEM`) para que aparezcan en el orden correcto dentro del historial del chat, junto a los mensajes `TEXT`.

---

## Gestión de Usuarios

El modelo `User` (`prisma/schema.prisma`) **siempre existe**, sin importar si la instalación usa autenticación `LOCAL` o `EXTERNAL`. La razón es que el chat necesita su propio registro para guardar información que no pertenece al sistema de autenticación: perfil, estado (`UserStatus`), avatar, y en el futuro cualquier preferencia o configuración propia del chat. Delegar la autenticación a un tercero no significa delegarle también estos datos.

### `id` vs. `externalId`

* **`id`** es la clave primaria interna (UUID) del perfil de usuario dentro del chat. **Todas** las relaciones del modelo de datos (`Conversation.createdBy`, `ConversationMember.user`, `Message.sender`, `Message.deletedBy`, `ChatAuditLog.user`) apuntan siempre a este `id`.
* **`externalId`** es un dato de correlación con el sistema externo de autenticación, no una clave foránea. Nunca se usa en una relación de Prisma.

### ¿Cuándo tiene valor `externalId`?

* Con `AuthProvider.LOCAL`: `externalId` es siempre `null`. El usuario existe únicamente en esta base de datos.
* Con `AuthProvider.EXTERNAL`: `externalId` almacena el identificador con el que el sistema externo reconoce a ese usuario, para poder emparejar el perfil del chat con la identidad externa.

### ¿Por qué todas las relaciones usan el `id` interno?

Porque `id` es estable y existe siempre, sin importar el proveedor de autenticación. Si las relaciones usaran `externalId`, el modelo dejaría de funcionar en instalaciones `LOCAL` (donde no hay ningún identificador externo) y quedaría acoplado a un sistema en particular. Usando siempre `id`, el resto del modelo de datos (conversaciones, mensajes, auditoría) es completamente independiente del proveedor de autenticación elegido.

### Identidad vs. perfil dentro del chat

La **identidad** del usuario (quién es, cómo se autentica, sus credenciales) es responsabilidad del proveedor de autenticación configurado (la propia aplicación o el sistema externo) y no vive en este modelo. El **perfil dentro del chat** (`User`) es la representación propia que el chat necesita para funcionar: a qué conversaciones pertenece, qué mensajes envió, cómo se muestra (nombre, avatar). Son conceptos relacionados pero distintos: el chat no necesita saber *cómo* se autenticó alguien para poder relacionarlo con sus conversaciones y mensajes, solo necesita su `id`.

---

## Proveedor de Autenticación

La aplicación soportará dos modos de autenticación, definidos por el enum `AuthProvider` (`prisma/schema.prisma`):

* **`LOCAL`** — la propia aplicación administra sus propios usuarios (sin depender de ningún sistema externo).
* **`EXTERNAL`** — la aplicación utiliza un proveedor externo (por ejemplo el ERP u otro sistema de identidad) para autenticar y sincronizar usuarios.

La selección del proveedor se realiza **una única vez, durante la instalación** del sistema, y permanece fija durante toda la vida de esa instalación.

En este punto del proyecto, `AuthProvider` solo está declarado en el esquema de Prisma: todavía no se lee desde variables de entorno, no hay lógica que dependa de su valor, ni servicios, middlewares o endpoints de autenticación. Esta sección documenta la intención de la arquitectura para pasos posteriores.

---

## Gestión de Archivos

Todos los archivos del sistema se representan mediante un único modelo centralizado, `StoredFile` (`prisma/schema.prisma`). Cualquier funcionalidad que necesite guardar un archivo lo reutiliza en lugar de definir su propia tabla de archivos.

### ¿Por qué existe `StoredFile`?

Antes de este cambio, cada funcionalidad que necesitaba archivos (adjuntos de mensajes, por ejemplo) tenía su propia tabla con su propia copia de los datos técnicos del archivo (ruta, nombre, tipo MIME, tamaño, etc.). Eso duplica información y obliga a repetir la misma lógica de almacenamiento en cada módulo. `StoredFile` centraliza esa información **una sola vez**: representa cualquier archivo físico guardado por el sistema, sin importar qué funcionalidad lo use (avatar de usuario, imagen de conversación, adjunto de mensaje, o cualquier archivo futuro).

### Diferencia entre `StoredFile` y `MessageFile`

* **`StoredFile`** es el archivo en sí: su información técnica y física (nombre original, nombre físico, ruta, tipo MIME, tamaño, proveedor, checksum). No sabe ni le importa quién lo usa.
* **`MessageFile`** no es un archivo: es la relación que dice "este mensaje usa este archivo". Solo contiene `messageId`, `fileId` y `createdAt`. Cualquier dato sobre el archivo en sí se consulta siempre a través de `StoredFile`, nunca se copia en `MessageFile`.

Este mismo patrón —una tabla de relación delgada apuntando a `StoredFile`— es el que se usaría para cualquier futura funcionalidad que necesite varios archivos asociados a un mismo registro (por ejemplo, varias imágenes en una entidad futura), en vez de repetir campos de archivo en cada modelo.

### ¿Por qué `User` y `Conversation` referencian archivos mediante relaciones?

`User.avatarFileId` y `Conversation.imageFileId` son relaciones hacia `StoredFile`, no campos con la ruta del archivo. Así, `User` y `Conversation` no necesitan saber nada sobre cómo está almacenado un archivo (proveedor, ruta, nombre físico): solo saben *qué* archivo usan. Toda esa información técnica sigue viviendo en un único lugar (`StoredFile`), y si cambia (por ejemplo, se migra de almacenamiento local a S3), no hay que tocar ni `User` ni `Conversation`.

### ¿Por qué no se guarda la ruta directamente en `User` o `Conversation`?

Porque eso duplicaría en cada modelo la misma información que ya vive en `StoredFile` (ruta, proveedor, tamaño, checksum, etc.), y perdería la ventaja de tener un único lugar para razonar sobre "todos los archivos del sistema" (para borrarlos, migrarlos de proveedor, auditar su uso, etc.). Guardar solo el `id` del `StoredFile` mantiene esa información en un único punto de verdad.

### ¿Por qué las URLs no se guardan en la base de datos?

Una URL pública depende del proveedor de almacenamiento activo (rutas de un servidor local, un bucket de S3, un endpoint de MinIO, un dominio de CDN, etc.) y puede cambiar sin que el archivo en sí cambie. Guardar la URL en la base de datos acoplaría el modelo de datos a un proveedor específico y obligaría a reescribir todas las URLs existentes si el proveedor cambia. En cambio, la base de datos guarda únicamente la ruta relativa, y es el proveedor de almacenamiento (`src/storage`, en un paso posterior) quien construye la URL pública cuando hace falta.

### ¿Por qué se almacena únicamente la ruta relativa?

Por ejemplo `chat/550e8400.pdf`, nunca `https://miapp.com/uploads/chat/550e8400.pdf` ni `C:\uploads\chat\550e8400.pdf`. Una ruta relativa es portable: sirve igual sin importar el dominio, el servidor o el sistema operativo donde corra la aplicación, y es lo único que un proveedor de almacenamiento necesita para ubicar el archivo dentro de su propio espacio (disco local, bucket, etc.).

### Propósito del campo `provider`

Indica en qué proveedor de almacenamiento vive físicamente ese archivo (`FileProvider`, hoy solo `LOCAL`). Como cada `StoredFile` declara su propio proveedor, el sistema podría convivir con archivos guardados en distintos proveedores a la vez (por ejemplo, durante una migración gradual de `LOCAL` a `S3`) sin ambigüedad sobre dónde buscar cada uno.

### Propósito del `checksum`

Es un hash del contenido del archivo. Sirve para verificar que el archivo no se corrompió entre que se guardó y se leyó, y, más adelante, para detectar archivos duplicados sin tener que comparar su contenido byte a byte. Es nullable porque no todos los flujos de guardado lo calculan necesariamente desde el día uno.

### Ventajas de reutilizar `StoredFile` para cualquier recurso del sistema

* Una sola definición de "qué es un archivo" para toda la aplicación, sin duplicar columnas técnicas en cada módulo.
* Cambiar de proveedor de almacenamiento (local → MinIO, S3, R2) es un cambio en la capa de `src/storage` y en el valor de `provider`, no en los modelos de negocio (`User`, `Conversation`, `Message`, ni los que vengan después).
* Cualquier funcionalidad futura que necesite archivos (documentos, íconos, exportaciones, etc.) reutiliza `StoredFile` en vez de crear su propia tabla de archivos.

### Diagrama de relaciones

```text
                 StoredFile
                     ▲
      ┌──────────────┼──────────────┐
      │              │              │
User.avatarFile   Conversation   MessageFile
                  .imageFile         │
                                     ▼
                                  Message
```

`StoredFile` es el centro: `User` y `Conversation` lo referencian directamente (avatar e imagen), y `Message` lo referencia indirectamente a través de `MessageFile` (porque puede tener varios archivos adjuntos). En los tres casos, el archivo en sí y su información técnica viven solo en `StoredFile`; el resto de los modelos únicamente guardan una relación hacia él.

---

## Arquitectura Socket.IO

Infraestructura base de comunicación en tiempo real. Este paso **no implementa ninguna funcionalidad de chat** (mensajes, conversaciones, presencia, typing, notificaciones, llamadas): únicamente deja preparado el mecanismo para que esas funcionalidades se construyan encima sin tocar el núcleo.

El detalle completo (propósito de cada archivo, cómo registrar un módulo o evento nuevo, rooms, middleware, principios) vive en [`src/socket/README.md`](./src/socket/README.md), junto al código que documenta.

---

# Principios

* La arquitectura está organizada por módulos (feature-based).
* Cada módulo debe ser lo más independiente posible.
* La lógica de negocio vive en los servicios.
* Los controladores únicamente reciben la petición y delegan al servicio.
* Los repositorios son los únicos que interactúan directamente con la base de datos.
* No colocar lógica de negocio en controladores.
* No colocar consultas Prisma fuera de los repositorios.
* Crear subcarpetas únicamente cuando realmente sean necesarias.
* Priorizar simplicidad antes que sobreingeniería.
* Mantener cada módulo autocontenido.
