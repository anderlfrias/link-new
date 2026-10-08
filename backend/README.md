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

Aquí viven los proveedores de almacenamiento (`StorageProvider`) que exponen una interfaz común para guardar, leer, transmitir (streaming) y borrar archivos, sin importar el backend físico utilizado:
* **`LocalDiskStorage`** (`FileProvider.LOCAL`): almacena y sirve archivos directamente desde el sistema de archivos local del servidor.
* **`S3Storage`** (`FileProvider.S3`): compatible con AWS S3, SeaweedFS (`weed server -s3`) y MinIO. Soporta generación de URLs presignadas para descarga y subida multipart (PUT por partes).

El acceso a los proveedores se resuelve dinámicamente según el proveedor registrado en cada archivo (`getProvider(file.provider)`) y la variable de entorno de escritura por defecto (`getWriteProvider()`). Detalle completo en [`src/modules/files/README.md`](./src/modules/files/README.md).

---

## src/workers

Procesos en segundo plano (background jobs) desacoplados del ciclo petición-respuesta.
Actualmente implementa:
* **`upload-cleanup.worker.ts`**: barrendero periódico de sesiones de subida multipart abandonadas o vencidas (> 24 horas), cancelando las subidas en S3 (`AbortMultipartUpload`) y marcando los registros como `EXPIRED` para evitar consumo innecesario de disco.
* **`file-migration.worker.ts`**: proceso en segundo plano para migración gradual y segura de archivos desde `LOCAL` hacia `S3`, garantizando el orden estricto de commit antes de borrar en disco local y configurable desde el panel de administración.

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
* **AuditLog** — el historial y audit trail normativo del sistema (mapeado físicamente a `chat_audit_logs`), registrando eventos de acceso (`LOGIN`, `LOGIN_FAILED`), cambios administrativos (`UPDATE_SETTINGS`, `ADMIN_DELETE_FILE`) y operaciones sobre conversaciones/mensajes, con actor (`user`), IP, user agent y request ID.

### Relaciones principales

* `User` 1—N `Conversation` (como creador), 1—N `ConversationMember`, 1—N `Message` (como remitente y, opcionalmente, como quien borró un mensaje ajeno), 1—N `AuditLog` y 1—N `StoredFile` (como quien lo subió); y N—1 `StoredFile` a través de `avatarFile`.
* `Conversation` 1—N `ConversationMember` y 1—N `Message`; y N—1 `StoredFile` a través de `imageFile`.
* `ConversationMember` N—1 `Conversation` y N—1 `User`.
* `Message` N—1 `Conversation`, N—1 `User` (remitente), 1—N `MessageFile`, y puede tener 0—N `AuditLog` asociados.
* `StoredFile` 1—N `MessageFile`, y puede ser referenciado por 0—N `User.avatarFile` y 0—N `Conversation.imageFile`.
* `MessageFile` N—1 `Message` y N—1 `StoredFile`.
* `AuditLog` referencia opcionalmente a `Conversation` y a `Message`, y opcionalmente a `User` (o `actorEmail` directo).

### ¿Por qué existen `lastReadMessageId`/`lastMessageAt` y sus contrapartes `lastDeliveredMessageId`/`lastMessageSenderId`?

Son campos **denormalizados**: guardan un dato que técnicamente podría calcularse con una consulta (el último mensaje de una conversación y quién lo envió, o el último mensaje que un miembro leyó/recibió), pero hacerlo así evitaría tener que agregar/ordenar sobre toda la tabla `Message` cada vez que se necesita listar conversaciones, calcular no leídos, o mostrar el estado de entrega/lectura de un mensaje. Por eso mismo son campos sueltos (`String`/`DateTime`), sin relación formal de Prisma hacia `Message`: mantenerlos actualizados es responsabilidad de la capa de servicios (`messages`, que es quien los vuelve stale), no de la base de datos.

* `ConversationMember.lastReadMessageId`/`lastReadAt` — hasta dónde **leyó** explícitamente el miembro (`POST /conversations/:id/read`).
* `ConversationMember.lastDeliveredMessageId`/`lastDeliveredAt` — hasta dónde le **llegó** el mensaje al miembro, sin acción explícita de su parte (en vivo por socket, o al pedir el historial).
* `Conversation.lastMessageId`/`lastMessageAt`/`lastMessageSenderId` — el último mensaje de la conversación y quién lo envió, para poder mostrar su estado de entrega/lectura en la lista de conversaciones sin leer `Message`.

Detalle completo (cómo se combinan en un estado por mensaje, quién actualiza qué) en [`src/modules/conversations/README.md`](./src/modules/conversations/README.md#confirmación-de-entrega-y-lectura) y [`src/modules/messages/README.md`](./src/modules/messages/README.md#confirmación-de-entrega-y-lectura).

### ¿Por qué "typing" (usuario escribiendo) no se almacena en la base de datos?

El estado de "está escribiendo" es efímero y de muy alta frecuencia (cambia varias veces por segundo mientras alguien teclea) y solo importa mientras la conexión de socket está activa. Persistirlo en PostgreSQL agregaría escrituras constantes sin ningún valor histórico. Este tipo de estado en tiempo real se maneja directamente en memoria a través de Socket.IO (ver `src/socket` y el `*.socket.ts` de cada módulo), no en el modelo de datos.

### Diferencia entre `Message` y `AuditLog`

`Message` es contenido del chat: lo que los usuarios ven en la conversación. `AuditLog` es metadata de auditoría sobre eventos del sistema: quién hizo qué y cuándo (crear la conversación, agregar/quitar un miembro, editar o borrar un mensaje, cambiar el nombre o la imagen del grupo, login, configuraciones). Un mismo evento puede generar ambas cosas a la vez — por ejemplo, "Juan agregó a Pedro" puede insertarse como un `Message` de tipo `SYSTEM` (para que se vea en el chat) *y* como un `AuditLog` con acción `ADD_MEMBER` (para el historial de auditoría) — pero conceptualmente son cosas distintas: uno es visible para los usuarios, el otro es un registro interno.
Por regla de privacidad no negociable (§4 de `LOGGING_PLAN.md`), `AuditLog` **nunca** almacena el contenido de los mensajes.

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

Cada instalación autentica con **un** proveedor, que se elige con el `.env` al arrancar (`src/auth-providers/init.ts`, ver [LOCAL_AUTH_PLAN.md](../docs/design/LOCAL_AUTH_PLAN.md) y [auth-providers.md](../docs/auth-providers.md)):

* **Un proveedor externo** — con `AUTH_PROVIDER_MODULE` definida: el módulo que señala valida las credenciales en el login y el chat sincroniza su perfil y sus roles.
* **`local`** — sin `AUTH_PROVIDER_MODULE`: la propia aplicación administra sus usuarios y sus credenciales. Ver [Modo local](./src/modules/auth/README.md#modo-local).

En los dos modos LINK emite su propia sesión (JWT firmado con `SESSION_JWT_SECRET`, obligatoria): el token del proveedor externo solo se usa en el login. Si el módulo del proveedor no existe o su configuración es inválida, el servidor no arranca. El proveedor activo se loguea al arrancar (`authProvider` en la línea `server listening`: `local` o su id).

El modo es de la instalación, no de cada cuenta, y no se guarda en la base: `User` es el perfil dentro del chat y no sabe con qué proveedor se autentica (ver "Identidad vs. perfil dentro del chat"). Las credenciales del modo local viven aparte, en `LocalCredential`.

Por eso una instalación puede cambiar de modo conservando el historial de sus usuarios. El procedimiento está en [LOCAL_AUTH_PLAN.md §10](../docs/design/LOCAL_AUTH_PLAN.md#10-cambiar-de-modo-en-una-instalación-existente). En resumen:

* **proveedor externo → `local`:** backup; sacar `AUTH_PROVIDER_MODULE` y las variables del proveedor del `.env` (`SESSION_JWT_SECRET` se conserva); reiniciar; `npm run auth:admin -- create-admin --email <correo de un admin actual>`. Esa cuenta conserva su historial y pasa a ser admin local; desde el panel (filtro "sin contraseña") se asignan las contraseñas del resto.
* **`local` → proveedor externo:** backup; alinear desde el panel el correo de cada cuenta con el del proveedor; agregar `AUTH_PROVIDER_MODULE` y las variables del proveedor, y reiniciar. Cada cuenta se reconoce por correo (sin distinguir mayúsculas) en su primer login con el proveedor, con el mismo `User.id`. Si el username del proveedor lo tiene otra cuenta, se le quita a esa (queda un `warn` con los dos UUIDs).

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

Una URL pública depende del proveedor de almacenamiento activo (rutas de un servidor local, un bucket de S3, un endpoint de MinIO, un dominio de CDN, etc.) y puede cambiar sin que el archivo en sí cambie. Guardar la URL en la base de datos acoplaría el modelo de datos a un proveedor específico y obligaría a reescribir todas las URLs existentes si el proveedor cambia. En cambio, la base de datos guarda únicamente la ruta relativa, y es el proveedor de almacenamiento (`src/storage`) quien construye la URL pública cuando hace falta — ver `getPublicUrl()` y [`src/modules/files/README.md`](./src/modules/files/README.md).

### ¿Por qué se almacena únicamente la ruta relativa?

Por ejemplo `chat/<conversationId>/2026/07/550e8400.pdf` (o `chat/2026/07/550e8400.pdf` si la subida todavía no tiene una conversación asociada — ver [`src/modules/files/README.md`](./src/modules/files/README.md)), nunca `https://miapp.com/uploads/chat/550e8400.pdf` ni `C:\uploads\chat\550e8400.pdf`. Una ruta relativa es portable: sirve igual sin importar el dominio, el servidor o el sistema operativo donde corra la aplicación, y es lo único que un proveedor de almacenamiento necesita para ubicar el archivo dentro de su propio espacio (disco local, bucket, etc.).

### Propósito del campo `provider`

Indica en qué proveedor de almacenamiento vive físicamente ese archivo (`FileProvider`: `LOCAL` o `S3`). Como cada `StoredFile` declara su propio proveedor, el sistema convive transparentemente con archivos guardados en distintos proveedores (por ejemplo, durante la migración en caliente de `LOCAL` a `S3`) sin ambigüedad sobre dónde buscar cada uno.

### Arquitectura de Subida Dual (Archivos Pequeños vs Grandes)

Para optimizar el uso de recursos y no saturar el event loop ni la memoria de Node.js, el sistema implementa dos caminos de subida:

1. **Subida Directa (≤ 16 MiB)**:
   * Endpoint: `POST /api/v1/files`.
   * El archivo viaja como `multipart/form-data` al backend de Express (`multer`), con un techo duro de seguridad de 32 MB (`ABSOLUTE_MAX_UPLOAD_BYTES`).
   * Se utiliza para avatares, fotos de grupo, notas de voz y adjuntos estándar pequeños.
   * Se guarda en el proveedor configurado en `STORAGE_WRITE_PROVIDER` (`LOCAL` o `S3`).

2. **Subida Chunked / Multipart (> 16 MiB hasta 2 GB)**:
   * Módulo: `POST /api/v1/uploads`.
   * El cliente corta el archivo en fragmentos de **8 MiB** y solicita URLs presignadas PUT a Link.
   * La transferencia de bytes se realiza **directamente desde el navegador hacia el storage S3 / SeaweedFS**, sin que el servidor de Node.js toque los bytes ni consuma memoria RAM.
   * Al finalizar todas las partes, Link verifica el tamaño real con `HeadObject` (invariante S1) y genera el `StoredFile` final.
   * Detalle completo en [`src/modules/uploads/README.md`](./src/modules/uploads/README.md).

### URLs Seguras de Descarga (`GET /api/v1/files/:id/content`)

Se eliminó por completo la exposición estática de archivos (la ruta `/uploads` ya no existe). Todo acceso a archivos se realiza a través del endpoint unificado de contenido:
* Las URLs públicas se firman con un token HMAC (`?t=...`, TTL 1 hora) o se autentican vía Bearer token.
* **Archivos en `LOCAL`**: Express valida permisos y hace streaming mediante `res.sendFile()`.
* **Archivos en `S3`**: Link responde con una redirección HTTP `302` hacia una URL presignada GET de corta duración (TTL 5 minutos) emitida por S3.
* **Cabeceras de protección**: Se envían `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` y `Content-Disposition: attachment; filename*=UTF-8''...` para cualquier archivo potencialmente peligroso (HTML, SVG, ejecutables, etc.), previniendo ataques de XSS almacenado.

### Propósito del `checksum`

Es un hash del contenido del archivo. Sirve para verificar que el archivo no se corrompió entre que se guardó y se leyó, y para detectar archivos duplicados sin tener que comparar su contenido byte a byte.

### Ventajas de reutilizar `StoredFile` para cualquier recurso del sistema

* Una sola definición de "qué es un archivo" para toda la aplicación, sin duplicar columnas técnicas en cada módulo.
* Cambiar de proveedor de almacenamiento (local → SeaweedFS, S3, R2) es un cambio en la capa de `src/storage` y en el valor de `provider`, no en los modelos de negocio (`User`, `Conversation`, `Message`, ni los que vengan después).
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

## Operaciones, Backup y Restauración (§6.4)

El almacenamiento de archivos desacopla la metadata de los bytes físicos. Esto introduce dos dominios de persistencia:
1. **Base de Datos PostgreSQL**: contiene las tablas `stored_files`, `file_uploads` y el resto de los datos de LINK. Si el servicio S3 guarda su propia metadata en una base (por ejemplo, el filer de SeaweedFS con `-database=postgres2`), esa base también es parte del backup.
2. **Almacenamiento de archivos**: el directorio `uploads/` (o el volumen `uploads` con Docker) para `STORAGE_WRITE_PROVIDER=LOCAL`, y el bucket S3 si se usa S3.

### Regla de Oro del Backup: Metadata PRIMERO, Bytes DESPUÉS

```bash
# 1. Respaldar PostgreSQL (metadata de LINK). Con el docker-compose.yml incluido:
docker compose exec -T postgres pg_dump -U link -d link -F c > link_$(date +%Y%m%d_%H%M%S).dump
#    Sin Docker: pg_dump -d "<DATABASE_URL>" -F c -f link_$(date +%Y%m%d_%H%M%S).dump

# 2. Respaldar los bytes: copiar uploads/ (o el volumen `uploads`) y/o sincronizar el
#    bucket S3 con la herramienta de tu proveedor (rclone, aws s3 sync, mc mirror...).
```

> [!IMPORTANT]
> **¿Por qué este orden?**
> Si la metadata se respalda en `T1` y los bytes en `T2 > T1`, la base de datos solo conoce objetos creados hasta `T1`. Todos esos objetos garantizadamente existirán en el respaldo de bytes tomado en `T2`.
> En el orden inverso (bytes primero, metadata después), cualquier archivo subido entre `T1` y `T2` quedaría registrado en la base de datos pero **ausente** del backup de bytes, produciendo referencias rotas irrecuperables. Los archivos subidos entre `T1` y `T2` con el orden correcto son simplemente huérfanos inofensivos que el barrendero de limpieza puede purgar posteriormente.

### Regla de Oro de la Restauración: Bytes PRIMERO, Metadata DESPUÉS

1. **Restaurar Bytes**: copiar de vuelta `uploads/` (o el volumen) y/o el contenido del bucket S3.
2. **Restaurar Base de Datos**: ejecutar `pg_restore` sobre la base de PostgreSQL.
3. **Iniciar Servicios**: iniciar el almacenamiento S3 (si aplica) y LINK. De este modo, desde el primer milisegundo en que la base de datos responde consultas, todos los bytes físicos referenciados ya están disponibles.

---

## Runbook de Operaciones y Troubleshooting

### 1. "No puedo subir un archivo grande"
* **Verificar cuota de subida en Admin**: Comprobar en el panel de administración (`Configuración > Tamaño máximo de archivo`) que el límite `maxUploadSizeMb` sea suficiente para el archivo.
* **Verificar sesiones concurrentes**: Cada usuario tiene un tope de 5 subidas simultáneas activas (`PENDING` o `UPLOADING`). Si el usuario tiene subidas colgadas, debe abortarlas o esperar su vencimiento (24h).
* **Verificar restricciones de tipo**: Comprobar si `fileTypeRestrictionMode` está en `ALLOWLIST` o `BLOCKLIST` y si el tipo MIME del archivo está bloqueado.
* **Verificar CORS del bucket S3**: La subida chunked se ejecuta directamente desde el navegador hacia S3. El bucket debe tener habilitada la política CORS permitiendo:
  - `AllowedOrigins`: dominio del frontend (ej. `https://chat.example.com`).
  - `AllowedMethods`: `GET`, `PUT`, `HEAD`.
  - `AllowedHeaders`: `*`, `content-type`, `x-amz-*`.
  - `ExposeHeaders`: `ETag`.
* **Verificar el reverse proxy**: Para subidas directas (≤ 16 MiB), el proxy tiene que aceptar bodies de al menos `16m` o `32m` (en nginx, `client_max_body_size`). Las partes de las subidas multipart son de 8 MiB, por debajo del límite por request de proxies como Cloudflare (100 MB en sus planes gratuitos).

### 2. "Error 403 Forbidden en subida de partes (Desfase de reloj NTP)"
* **Causa**: Las URLs presignadas de AWS S3 (SigV4) incluyen una marca de tiempo (`X-Amz-Date`). Si el reloj del servidor o del cliente difiere por más de 15 minutos respecto a la hora UTC real, S3 rechaza la petición con `RequestTimeTooSkewed` (403 Forbidden).
* **Solución en Servidor** (Linux con systemd):
  ```bash
  timedatectl status
  sudo timedatectl set-ntp on
  sudo systemctl restart systemd-timesyncd # o chrony
  ```

### 3. "Espacio en disco bajo (sesiones abandonadas y purga de huérfanos)"
* **Sesiones multipart incompletas**: Cuando un usuario interrumpe una subida de 2 GB cerrando el navegador, los fragmentos subidos consumen espacio en S3.
* **Limpieza automática**: `upload-cleanup.worker.ts` se ejecuta periódicamente (por defecto cada 6 horas) y aborta en S3 cualquier sesión abandonada que supere las 24 horas de inactividad (`TTL_INACTIVE_HOURS = 24`), liberando los bytes en storage.
* **Inspección manual en base de datos**:
  ```sql
  SELECT status, count(*), sum(total_size) / (1024*1024*1024) AS total_gb
  FROM file_uploads
  GROUP BY status;
  ```
* **Migración de almacenamiento**: Si se está migrando de `LOCAL` a `S3`, verificar en `AppSettings` que `fileMigrationDeleteLocalAfterCommit` esté habilitado si se requiere liberar el espacio en disco local inmediatamente tras verificar la copia en S3.

### 4. "Inspección de logs y diagnóstico en producción"

El backend emite logs estructurados en formato JSON por línea a `stdout` (Pino). Quién los guarda depende de cómo se despliegue:

* **¿Dónde están los logs?**
  ```bash
  # Con Docker (docker-compose.yml):
  docker compose logs backend --tail 100
  # Con PM2 (ecosystem.config.js), que los escribe en ~/.pm2/logs/ (rotarlos con pm2-logrotate):
  pm2 logs link-backend --lines 100 --raw
  ```

* **¿Cómo filtrar por nivel o buscar errores?**
  Usando `jq` sobre la salida JSON (nivel 30 = info, 40 = warn, 50 = error, 60 = fatal):
  ```bash
  docker compose logs backend --no-log-prefix --tail 200 | jq 'select(.level >= 50)'
  ```

* **¿Cómo rastrear una petición puntual?**
  Cada petición HTTP genera y propaga un `requestId` (devuelto al cliente en el header `x-request-id` de la respuesta). Si un usuario reporta un fallo con su ID de petición:
  ```bash
  docker compose logs backend --no-log-prefix --tail 500 | jq 'select(.requestId == "d8a2bc41-...")'
  ```
  Esto devolverá exactamente la traza completa (inicio de request HTTP, logs internos de servicios, consultas lentas y respuesta final con tiempo de procesamiento).

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
