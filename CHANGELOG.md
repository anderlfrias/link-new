# Registro de Cambios (Changelog)

Todas las modificaciones notables de este proyecto se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Docker**: `Dockerfile` de backend y frontend y `docker-compose.yml` (PostgreSQL + backend + frontend). El backend aplica las migraciones pendientes al arrancar.
- **Migraciones de base de datos**: migración inicial `0_init` en `backend/prisma/migrations` y scripts `db:migrate`, `db:migrate:dev` y `db:baseline` (para instalaciones creadas con `prisma db push`).
- **Autenticación EXTERNAL_AUTH opcional**: el modo se deduce del `.env` (con las tres `EXTERNAL_AUTH_*`, EXTERNAL_AUTH; sin ninguna, modo local). El inicio de sesión con cuentas locales todavía está en desarrollo.
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
- Sin `GIPHY_API_KEY`, el selector de emojis oculta las pestañas de GIFs, stickers y favoritos, igual que cuando un admin desactiva la opción. Antes mostraba pestañas que solo daban error. La integración con GIPHY queda deshabilitada por defecto: ver `backend/src/modules/giphy/README.md`, "Requisitos de GIPHY".
- Nuevo sonido de notificación, sintetizado por el proyecto (`scripts/generate-notification-sound.js`), en lugar del archivo anterior, de origen desconocido.
- `npm run prisma:sync` ahora aplica migraciones (`prisma migrate deploy`) en lugar de `prisma db push`. Las instalaciones existentes tienen que correr una vez `npm run db:baseline` (ver README).
- Versión de Node.js requerida: 22.12 o superior, o 24 (`engines` y `.nvmrc`).
- Los hosts permitidos del servidor de desarrollo del frontend se configuran con `NEXT_ALLOWED_DEV_ORIGINS`.
- Los documentos de diseño se movieron a `docs/design/`.
- Ejemplos, tests y nombres de colores de avatar usan datos genéricos.
- Actualización de Next.js a 16.3.8 y de Prisma a 7.10.0.

### Corregido
- En una base de datos nueva, el primer arranque del backend se caía: los workers creaban la configuración global en paralelo y chocaban por la clave única.
- Dos archivos de tests de socket no llegaban a ejecutarse desde que las llamadas envían notificaciones push.
- Errores de tipos en tests del frontend que bloqueaban el build con Next.js 16.3, y el tipo de la acción de reacciones (faltaba `"updated"`).
- `ecosystem.config.js` no encontraba el binario de Next.js cuando `next` queda instalado en la raíz del monorepo.
- Un body JSON mal formado o demasiado grande respondía 500. Ahora responde 400 o 413.

### Seguridad
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
