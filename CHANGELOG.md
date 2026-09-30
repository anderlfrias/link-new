# Registro de Cambios (Changelog)

Todas las modificaciones notables de este proyecto se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

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
