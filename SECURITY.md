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
sesión) y la guarda en los logs y en el registro de auditoría. Cómo la obtiene depende de dos
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
