# Registro de Cambios (Changelog)

Todas las modificaciones notables de este proyecto se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Licencia**: LINK pasa a ser software libre bajo la GNU Affero General Public License v3.0 (`AGPL-3.0-only`). Ver `LICENSE` y la sección "Licencia" del README.
- **Docker**: `Dockerfile` de backend y frontend y `docker-compose.yml` (PostgreSQL + backend + frontend). El backend aplica las migraciones pendientes al arrancar.
- **Migraciones de base de datos**: migración inicial `0_init` en `backend/prisma/migrations` y scripts `db:migrate`, `db:migrate:dev` y `db:baseline` (para instalaciones creadas con `prisma db push`).
- **Autenticación local, con EXTERNAL_AUTH opcional**: el modo se deduce del `.env` (con las tres `EXTERNAL_AUTH_*`, EXTERNAL_AUTH; sin ninguna y con `LOCAL_AUTH_JWT_SECRET`, modo local). En modo local las cuentas y sus contraseñas viven en la base de LINK: se inicia sesión con el correo o el nombre de usuario, y el primer admin se crea con `npm run auth:admin -- create-admin --email <correo>`. Ver la sección "Autenticación" del README y `docs/design/LOCAL_AUTH_PLAN.md`.
- **Cambio de contraseña** (modo local): desde el perfil, y obligatorio al entrar con una contraseña temporal, vencida o que no cumple la política vigente. Mientras no se cambia, la sesión solo sirve para cambiarla.
- **Administración de cuentas** (modo local): desde el panel de usuarios, un admin crea y edita cuentas, asigna el rol de admin, restablece contraseñas (la temporal se muestra una sola vez) y desbloquea cuentas. Filtros por estado y por cuentas sin contraseña.
- **Política de sesión y contraseñas** (modo local), en la configuración global: duración de la sesión, largo mínimo, reglas de composición, vencimiento, historial y bloqueo por intentos fallidos. Todo apagado por defecto salvo el largo mínimo de 12 caracteres. El panel advierte, antes de guardar, qué cambios cortan sesiones abiertas o piden cambiar la contraseña en el próximo inicio de sesión.
- **Desactivar cuentas** (los dos modos): un admin puede desactivar y reactivar el acceso de cualquier cuenta al chat. Una cuenta desactivada no inicia sesión (en modo external-auth, aunque EXTERNAL_AUTH valide sus credenciales), sus sesiones abiertas se cortan y la sincronización con EXTERNAL_AUTH no la reactiva. Nadie puede desactivarse a sí mismo, y en modo local siempre queda al menos un admin activo.
- **Auditoría de cuentas**: acciones `CREATE_USER`, `UPDATE_USER`, `RESET_PASSWORD` y `CHANGE_PASSWORD`. `LOGIN` y `LOGIN_FAILED` registran el modo de autenticación y, en modo local, el motivo del fallo. El panel de auditoría los muestra junto a la acción.
- **Documentación para publicar el proyecto**: README para instalar desde cero, `CONTRIBUTING.md`, `SECURITY.md`, plantillas de issues y PR, y Dependabot.
- **CI**: tests, builds, verificación de que las migraciones coinciden con el schema y build de las imágenes Docker, con Node.js 24.
- `THIRD_PARTY_NOTICES.md`: licencias de los diseños de avatares, tipografías, íconos y dependencias, y la lista de assets de marca.
- El personalizador de avatar acredita título, autor, fuente y licencia de los estilos de DiceBear bajo CC BY 4.0.
- Variables `TRUST_PROXY` y `TRUST_CF_CONNECTING_IP` para indicar qué proxies hay delante del backend (ver `SECURITY.md`).
- Cabeceras de seguridad en todas las respuestas del frontend (`Content-Security-Policy` con `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

### Cambiado
- **Acción requerida en producción:** con `NODE_ENV=production`, el backend no arranca sin `CORS_ORIGIN`. Definirla con el origen del frontend (o con `*` para aceptar cualquier origen a propósito). Antes, sin definirla, la API aceptaba cualquier origen.
- **Acción requerida detrás de Cloudflare:** el backend ya no toma la IP del cliente de `CF-Connecting-IP` salvo con `TRUST_CF_CONNECTING_IP=true`. Si hay un proxy entre Cloudflare y el backend y no se define, el rate limiting y la auditoría ven la IP del proxy. `trust proxy` sigue en `1` por defecto (`TRUST_PROXY`).
- LINK ya no se puede embeber en un iframe de otro origen.
- **Migración de datos irreversible** (`20261008120000_purge_deleted_message_content`): borra el texto, las encuestas y la relación con los archivos de los mensajes que ya estaban eliminados. No cambia el schema. **Hacer un backup de la base antes de aplicarla.** Los archivos no se borran: los que queden sin uso los libera la limpieza de archivos huérfanos, si un admin la activó.
- **Migración de base de datos nueva** (`20261006150000_local_auth`): tabla de credenciales locales y campos nuevos en `users` y `app_settings`. Se aplica con `npm run db:migrate`, o sola al arrancar el contenedor del backend. No cambia nada en una instalación EXTERNAL_AUTH.
- El panel de usuarios deja de ser de solo lectura: en modo external-auth permite desactivar y reactivar cuentas; los demás datos se siguen administrando en EXTERNAL_AUTH.
- El campo del login dice "Usuario o correo electrónico" en los dos modos.
- Las respuestas de error de la API pueden incluir `code`, un identificador estable del motivo, además de `error` (ver `backend/API.md`, sección 1).
- Sin `GIPHY_API_KEY`, el selector de emojis oculta las pestañas de GIFs, stickers y favoritos, igual que cuando un admin desactiva la opción. Antes mostraba pestañas que solo daban error. La integración con GIPHY queda deshabilitada por defecto: ver `backend/src/modules/giphy/README.md`, "Requisitos de GIPHY".
- Nuevo sonido de notificación, sintetizado por el proyecto (`scripts/generate-notification-sound.js`), en lugar del archivo anterior, de origen desconocido.
- `npm run prisma:sync` ahora aplica migraciones (`prisma migrate deploy`) en lugar de `prisma db push`. Las instalaciones existentes tienen que correr una vez `npm run db:baseline` (ver README).
- Versión de Node.js requerida: 22.12 o superior, o 24 (`engines` y `.nvmrc`).
- Los hosts permitidos del servidor de desarrollo del frontend se configuran con `NEXT_ALLOWED_DEV_ORIGINS`.
- Los documentos de diseño se movieron a `docs/design/`.
- Ejemplos, tests y nombres de colores de avatar usan datos genéricos.
- Actualización de Next.js a 16.3.8 y de Prisma a 7.10.0.

### Corregido
- Con almacenamiento en disco (el valor por defecto), los archivos de más de 16 MiB fallaban: se mandaban por la subida por partes, que solo existe con S3, y la pantalla anunciaba un límite de 2048 MB. Ahora se suben directo hasta 32 MB, la interfaz muestra el límite real (y rechaza un archivo demasiado grande antes de subirlo), el panel de administración avisa cuando el máximo configurado no se puede alcanzar sin S3, y `POST /api/v1/uploads` responde `503` con `code: "chunked_uploads_unavailable"`. La subida por partes sigue necesitando S3.
- En una base de datos nueva, el primer arranque del backend se caía: los workers creaban la configuración global en paralelo y chocaban por la clave única.
- Dos archivos de tests de socket no llegaban a ejecutarse desde que las llamadas envían notificaciones push.
- Errores de tipos en tests del frontend que bloqueaban el build con Next.js 16.3, y el tipo de la acción de reacciones (faltaba `"updated"`).
- `ecosystem.config.js` no encontraba el binario de Next.js cuando `next` queda instalado en la raíz del monorepo.
- Un body JSON mal formado o demasiado grande respondía 500. Ahora responde 400 o 413.
- En modo external-auth, iniciar sesión respondía 500 si el nombre de usuario que trae EXTERNAL_AUTH ya lo tenía otra cuenta. Ahora manda el de EXTERNAL_AUTH: la otra cuenta lo pierde y queda un aviso en el log.

### Seguridad
- Un usuario podía adjuntar a un mensaje un archivo que no tenía permitido ver, si conocía su id, y así obtener acceso a su contenido.
- Al crear un grupo o cambiar su imagen se aceptaba el id de cualquier archivo, lo que daba a los miembros acceso a un archivo ajeno.
- Los adjuntos de un mensaje borrado, o de un grupo eliminado, seguían descargables para los miembros que conservaban el enlace.
- Un miembro quitado de un grupo, o que salía de él, seguía recibiendo en tiempo real los mensajes nuevos mientras su conexión siguiera abierta.
- El servidor reenviaba señales de llamada (WebRTC) a cualquier usuario, sin comprobar que emisor y destinatario fueran los participantes de una llamada en curso. Ahora el destino lo decide el servidor, y las señales de más de 64 KiB se descartan.
- Los errores inesperados de una llamada ya no devuelven al cliente el mensaje interno (por ejemplo, el de un error de la base de datos).
- Las suscripciones de notificaciones push aceptaban cualquier URL, y el servidor le enviaba peticiones a esa URL al notificar. Ahora solo se aceptan los servicios push de los navegadores (Google, Mozilla, Microsoft y Apple).
- Un usuario podía dar de baja la suscripción push de otro si conocía su endpoint.
- Las notificaciones push, con el texto de los mensajes, seguían llegando a un navegador después de cerrar sesión, y a los dispositivos de una cuenta desactivada o con la contraseña restablecida.
- Cualquier usuario podía crear registros de llamada falsos en sus conversaciones, por la API o reenviando un registro real. Los registros de llamada y las encuestas ya no se pueden reenviar.
- Una tarjeta de contacto podía mostrar el nombre y el correo de una persona y abrir el chat con otra, o cargar su foto desde un sitio externo. Ahora el servidor arma la tarjeta con los datos reales de la cuenta.
- La conexión en tiempo real seguía abierta, recibiendo mensajes, después de que vencía la sesión.
- Cualquiera podía impedirle a otra persona iniciar sesión durante 15 minutos con cinco intentos fallidos usando su usuario. Ahora el límite de cinco intentos es por usuario y por IP, con un tope más alto por usuario desde cualquier IP.
- El texto de los mensajes borrados (por su autor o por la retención automática) quedaba guardado en la base, junto con sus encuestas y la relación con sus archivos. Ahora se descarta al borrar.
- Se limita la frecuencia de envío de mensajes (120 por minuto por usuario) y de eventos en tiempo real (por socket), para que nadie pueda saturar el servidor ni a otros usuarios.
- Las restricciones de tipo de archivo de la configuración global se podían evadir declarando otro tipo al subir. Ahora también se verifica el contenido real de los formatos más comunes (ejecutables, comprimidos, PDF, imágenes, audio y video). Los formatos de texto no tienen firma y siguen validándose por el tipo declarado. Un avatar tiene que ser una imagen real (PNG, JPEG, GIF o WebP).
- Actualización de dependencias con vulnerabilidades conocidas (`next`, `multer`, `engine.io`, `express`, `qs`, `proxy-addr`, entre otras).
- Un cliente podía saltarse el límite de intentos de inicio de sesión, y falsear su IP en logs y auditoría, mandando su propia cabecera `CF-Connecting-IP`.
- Los errores de body-parser se logueaban con el body crudo del request, que podía incluir contraseñas.
- La subida de archivos aceptaba campos de texto sin límite de cantidad, guardados en memoria.
- La importación de GIPHY seguía redirecciones sin revalidar el host y leía el archivo entero antes de comprobar el tamaño.
- El frontend ya no envía la cabecera `X-Powered-By`.

### Eliminado
- `graphify-out/` (salida generada localmente) del repositorio, archivos sin uso de la plantilla de Next.js y `TODO.md`.

## [1.0.1] - 2026-10-02

### Corregido
- **Manejo de llamadas y señalización WebRTC**: Incorporación del estado transitorio de conexión (`connecting`) tras la aceptación de llamada, descarte de señales WebRTC para llamadas finalizadas y prevención de conexiones huérfanas.
- **Retroalimentación de errores en llamadas**: Notificación al usuario ante fallos de acceso a micrófono o cámara (`mediaError`), detección y advertencia de contexto no seguro sin HTTPS (`insecureContext`), y fallos irrecuperables en la negociación SDP (`connectionFailed`).

## [1.0.0] - 2026-09-30


### Añadido
- **Reacciones a mensajes**: Reacción con emojis flotantes a mensajes en tiempo real con recuento dinámico.
- **Búsqueda interactiva en el chat**: Buscador integrado en la cabecera de la conversación con resaltado de términos, conteo de coincidencias y navegación secuencial (anterior/siguiente).
- **Menciones y contactos**: Autocompletado de menciones con `@` en chats grupales y modal para compartir contactos directamente en la conversación.
- **Borradores de mensajes (Drafts)**: Persistencia automática del texto en edición por conversación en almacenamiento local (`localStorage`).
- **Copiado parcial de texto**: Detección de selección de texto dentro del mensaje y menú contextual para copiar solo el fragmento seleccionado o el mensaje completo.
- **Selección múltiple de mensajes**: Modo de selección en el chat para copiar, eliminar o reenviar múltiples mensajes en lote.
- **Selección múltiple de conversaciones**: Modo de selección en el listado lateral para eliminar varios chats o salir de múltiples grupos simultáneamente.
- **Segmentación e identificación multimedia**: Previsualizaciones específicas por tipo de contenido (notas de voz con duración, imágenes, stickers, GIFs, documentos) en la lista de conversaciones y notificaciones.
- **Favoritos multimedia**: Pestaña y gestión de emojis, stickers y GIFs favoritos con persistencia local para acceso rápido.
- **Cámara integrada**: Captura fotográfica nativa directamente desde el navegador/app con selector de cámara y confirmación previa al envío.
- **Gestión de salida de grupos**: Opción para que los usuarios abandonen grupos, configurable a nivel global desde el panel de administración y por administradores de cada grupo.
- **Encuestas interactivas**: Envío y votación de encuestas en chats grupales con soporte de voto único o múltiple y cálculo porcentual en tiempo real.
- **Llamadas y videollamadas**: Comunicación de voz y video en tiempo real vía WebRTC / Socket.IO, con tonos de llamada (timbrado, entrante, ocupado, fin), conmutación de dispositivos y ventana superpuesta.
- **Multi-idioma (i18n)**: Soporte completo e internacionalización de la aplicación en Español e Inglés en chats, componentes interactivos y panel de administración con selector en tiempo real.
- **Reenvío de IP de cliente a EXTERNAL_AUTH**: Reenvío transparente de la IP real del cliente (`x-forwarded-for` / `req.ip`) hacia el servicio de autenticación EXTERNAL_AUTH para prevenir bloqueos masivos y habilitar rate limiting granular.
- **Preservación de selección en reenvío**: Modal de reenvío de mensajes que conserva los destinatarios seleccionados al buscar y filtrar la lista.
- **Visualización de versión en la interfaz**: Indicador de versión al pie del panel de perfil del usuario para trazabilidad y soporte técnico.
- **Script de sincronización de versiones**: Automatización de sincronización de versión entre la raíz, el backend y el frontend (`npm run version:sync`).

### Cambiado
- Actualización de los iconos de la aplicación, favicon y manifiesto de la PWA para una identidad visual consistente.
- Optimización de experiencia de usuario y diseño responsivo en interfaces móviles y de escritorio.

### Seguridad
- Rate limiting por usuario y fallback por IP en endpoints de autenticación y subida de archivos.
- Retención automática y configurable del registro de auditoría (`audit trail`), sanitizando secretos y tokens de acceso.

## [0.1.0] - 2026-09-15

### Añadido
- **Mensajería en tiempo real**: Arquitectura bidireccional basada en Express, Socket.IO y PostgreSQL con Prisma ORM.
- **Autenticación con EXTERNAL_AUTH**: Inicio de sesión corporativo con tokens JWT y middleware de autorización por roles.
- **Gestión de archivos y multimedia**: Subida de archivos con URLs prefirmadas a almacenamiento compatible con Amazon S3 / MinIO y streaming de audio para notas de voz.
- **Notificaciones**: Soporte para notificaciones push Web Push (VAPID) y alertas sonoras configurables.
- **Panel de administración**: Vistas para gestión de usuarios, auditoría de actividades, monitoreo de almacenamiento y parámetros del sistema.
- **Personalización de avatares**: Catálogo de avatares con integración DiceBear e ilustraciones personalizadas.
- **Infraestructura de pruebas unitarias**: Configuración completa con Vitest para backend y frontend con cobertura exhaustiva (más de 1,700 pruebas).
- **Registro estructurado**: Implementación de logging estructurado con Pino y contexto correlacionado por request ID.
- **Soporte PWA**: Configuración de Service Worker y manifiesto para instalación como aplicación web progresiva.
