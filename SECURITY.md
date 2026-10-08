# Política de seguridad

## Reportar una vulnerabilidad

**No abrir un issue público.** Reportarla en privado desde la pestaña **Security** del
repositorio, con la opción **Report a vulnerability** (GitHub Security Advisories).

Incluir, si es posible:

- versión o commit afectado,
- pasos para reproducirla,
- impacto estimado,
- y, si existe, una propuesta de corrección.

Vamos a confirmar la recepción y coordinar la corrección y su publicación antes de divulgar
detalles.

## Versiones soportadas

Solo se corrigen vulnerabilidades sobre la última versión publicada (rama `main`).

## Recomendaciones para desplegar LINK

- **HTTPS obligatorio en producción.** Las llamadas (cámara y micrófono) y las notificaciones
  push solo funcionan en un contexto seguro, y el token de sesión viaja en cada request.
  Configurar HSTS (`Strict-Transport-Security`) en el proxy que termina TLS. La app no lo envía
  porque también corre por HTTP en desarrollo o en una LAN.
- **Definir `CORS_ORIGIN`** con el origen exacto del frontend. Con `NODE_ENV=production` (la
  imagen Docker y `ecosystem.config.js` lo fijan) el backend no arranca sin esa variable.
  `CORS_ORIGIN=*` abre la API y el socket a cualquier origen, y solo conviene a propósito.
- **Usar secretos propios y fuertes:**
  - `LOCAL_AUTH_JWT_SECRET` o `EXTERNAL_AUTH_JWT_SECRET`.
  - Un `FILE_URL_SIGNING_SECRET` dedicado, distinto del secreto JWT.
  - Claves VAPID generadas para la instalación.
  - Nunca reutilizar los valores de ejemplo.
- **No exponer PostgreSQL** fuera de la red interna. En el `docker-compose.yml` incluido, la
  base no publica puertos hacia el host.
- **Una sola instancia del backend.** Varias instancias, además de romper los eventos en tiempo
  real, multiplican los límites de rate limiting, que viven en memoria.
- **Almacenamiento S3.** Restringir el CORS del bucket al origen del frontend y no dar acceso
  público de lectura: los archivos se sirven con URLs firmadas de corta duración.
- **Mantener las dependencias actualizadas** (`npm audit`) y hacer backups de la base y del
  almacenamiento de archivos.

### Reverse proxy e IP del cliente

El backend usa la IP del cliente para el rate limiting (por ejemplo, el de intentos de inicio de
sesión) y la guarda en los logs y en el registro de auditoría. El límite de inicio de sesión es de
5 fallos cada 15 minutos por usuario **y por IP**, con un tope de 20 por usuario desde cualquier IP:
así, quien escribe el usuario de otra persona desde su IP solo agota su propio cupo. Eso depende de
ver la IP real: si todos los clientes aparecen con la del proxy, el cupo se comparte. Cómo la obtiene depende de dos
variables:

| Instalación | `TRUST_PROXY` | `TRUST_CF_CONNECTING_IP` |
|---|---|---|
| Backend expuesto directo, sin proxy | `false` | `false` |
| Un proxy delante (nginx, Caddy, Traefik, Cloudflare Tunnel) | `1` (por defecto) | `false` |
| Dos proxies encadenados (por ejemplo, Cloudflare → nginx → backend) | `2` | `false`, o `true` si todo el tráfico entra por Cloudflare |

- `TRUST_PROXY` es el valor de `trust proxy` de Express. Si es más alto que la cantidad real de
  proxies, un cliente puede elegir su IP mandando `X-Forwarded-For`. Si es más bajo, todos los
  clientes aparecen con la IP del proxy y comparten los límites de rate limiting.
- `TRUST_CF_CONNECTING_IP=true` toma la IP de la cabecera `CF-Connecting-IP`. Solo es segura si
  el backend no es accesible sin pasar por Cloudflare: cualquier cliente que llegue directo
  puede mandar esa cabecera con la IP que quiera.
- El proxy debe sobrescribir `X-Forwarded-For` (o agregarle la IP real del cliente), no
  reenviar la que manda el cliente tal cual.
- En los eventos del socket, la IP es la de la conexión TCP (la del proxy, si hay uno), salvo que
  `TRUST_CF_CONNECTING_IP` esté activa.

### Cabeceras de seguridad del frontend

`frontend/next.config.ts` agrega a todas las respuestas `Content-Security-Policy`
(`frame-ancestors 'self'`, `base-uri`, `form-action`, `object-src`), `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` (cámara y micrófono solo para
el propio origen). Como consecuencia, LINK no se puede embeber en un iframe de otro origen. La
CSP no restringe de dónde se cargan scripts, estilos, imágenes ni conexiones, porque la API, el
socket y el almacenamiento S3 cambian con cada instalación.

El backend usa `helmet` con su configuración por defecto, y los archivos se sirven con
`X-Content-Type-Options: nosniff` y una CSP `sandbox`.

### Notificaciones push

Cada notificación hace un POST desde el servidor al endpoint que registró el navegador. Para que
nadie pueda apuntar ese POST a otra URL, el backend solo acepta endpoints `https` (puerto 443) de
los servicios push de los navegadores: `fcm.googleapis.com`, `android.googleapis.com`,
`push.services.mozilla.com`, `notify.windows.com` y `push.apple.com`. Un navegador con otro
servicio no puede suscribirse hasta que se agregue su dominio en
`backend/src/modules/push/push-endpoint.ts`. La notificación lleva el texto del mensaje: se borran
las suscripciones de una cuenta al desactivarla o al restablecer su contraseña, y el frontend da de
baja la del navegador al cerrar sesión.

## Limitaciones conocidas

Cosas que LINK hace así a propósito, o que todavía no resuelve. No son vulnerabilidades por
reportar: si encontrás una forma de abusar de alguna que no esté descrita acá, sí lo es.

- **El directorio muestra el correo de todas las cuentas activas.** Es intencional para un chat
  interno: el correo es el identificador de login en modo local, y el directorio de una
  organización suele ser visible para todos sus miembros. Sin búsqueda, el directorio devuelve
  como máximo 100 cuentas.
- **Los avatares se descargan sin autenticación.** El frontend los carga con `<img>`, que no manda
  token. Los ids son UUID v4 (no se pueden adivinar) y un avatar es visible para toda la
  instalación de todos modos.
- **Los mensajes no tienen cifrado de extremo a extremo.** El contenido vive en claro en la base,
  como en cualquier chat con moderación y auditoría. Al borrar un mensaje para todos (o al vencer la
  retención) su contenido se descarta de forma irreversible, pero un backup anterior lo conserva.
- **Las notificaciones push llevan el texto del mensaje.** El payload viaja cifrado entre el
  backend y el navegador (RFC 8291), pero la notificación se muestra en la pantalla de bloqueo del
  dispositivo. No hay una opción para ocultar el texto.
- **El push sigue activo después de que la sesión vence sin cerrar sesión.** Se da de baja al
  cerrar sesión, al desactivar la cuenta y al restablecer o cambiar la contraseña, pero no cuando el
  token vence solo: el dispositivo sigue recibiendo notificaciones hasta el próximo inicio o cierre
  de sesión.
- **Las URLs firmadas de archivos valen 1 hora y son portadoras:** quien tiene la URL descarga el
  archivo. Alguien quitado de un grupo puede usar las que ya recibió hasta que vencen.
- **El socket se corta en el vencimiento firmado del token**, no antes: bajar la duración de sesión
  en la configuración (modo local) no acorta las conexiones que ya existen.
- **La restricción de tipos de archivo no cubre los formatos de texto.** Además del tipo que declara
  el cliente se mira el contenido real, pero solo de los formatos con firma conocida (ejecutables,
  comprimidos, PDF, imágenes, audio y video más comunes). CSV, TXT, JSON y scripts (`.bat`, `.ps1`,
  `.sh`) se validan solo por el tipo declarado.
- **El token de sesión vive en `localStorage` y la CSP no restringe scripts.** No hay un punto de
  XSS conocido, pero una cookie `httpOnly` o una CSP con `nonce` limitarían el daño de uno. Está
  pendiente de decidir.
- **Los límites de frecuencia viven en memoria de un solo proceso.** Con varias instancias del
  backend se multiplican; ver "Una sola instancia del backend" arriba. Aplica a los límites de
  inicio de sesión, de envío de mensajes, de subida y descarga de archivos, y de eventos del socket.
