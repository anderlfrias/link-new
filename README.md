# LINK

Chat interno para equipos y organizaciones, pensado para instalarse en infraestructura propia.
Monorepo con un backend en Express + Socket.IO + Prisma (PostgreSQL) y un frontend en Next.js.

> **Autenticación:** LINK funciona con cuentas propias (modo local, sin dependencias externas) o
> delegando el login en un servicio de identidad externo compatible con EXTERNAL_AUTH. El modo se elige
> en el `.env`; ver [Autenticación](#autenticación).

## Funcionalidades

- Conversaciones privadas, grupos y "mensajes guardados" (chat con uno mismo), en tiempo real.
- Reacciones, menciones con `@`, búsqueda dentro del chat, borradores, reenvío y selección
  múltiple de mensajes y conversaciones.
- Adjuntos (archivos, imágenes, notas de voz, fotos desde la cámara) con almacenamiento en disco
  o en un servicio compatible con S3, incluida la subida por partes de archivos grandes.
- Encuestas en grupos, compartir contactos y GIFs/stickers vía GIPHY (deshabilitado por defecto,
  ver [Requisitos de GIPHY](backend/src/modules/giphy/README.md#requisitos-de-giphy)).
- Llamadas y videollamadas 1 a 1 (WebRTC).
- Notificaciones push (Web Push) y PWA instalable.
- Panel de administración: configuración global, almacenamiento, usuarios (en modo local, alta de
  cuentas, contraseñas y política de sesión) y registro de auditoría.
- Interfaz en español e inglés, con tema claro y oscuro.

## Requisitos

- **Node.js** 24 (recomendado) o 22.12 o superior, con npm. La versión está fijada en `.nvmrc`.
- **PostgreSQL** (probado con la 17).
- **Docker** y Docker Compose, opcionales, para levantar todo con un comando.
- Opcional: un servicio compatible con S3 (SeaweedFS, MinIO, AWS S3…) para el almacenamiento de
  archivos.

## Inicio rápido con Docker

Levanta PostgreSQL, el backend y el frontend. Las migraciones de base de datos se aplican solas
al arrancar el backend.

```bash
cp .env.example .env
```

Completar en `.env` como mínimo:

- `POSTGRES_PASSWORD`.
- `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. Generarlas con `npx web-push generate-vapid-keys`
  o, sin Node instalado, con
  `docker run --rm node:24-bookworm-slim npx -y web-push generate-vapid-keys`.
- La autenticación: las tres `EXTERNAL_AUTH_*`, o `LOCAL_AUTH_JWT_SECRET` (ver
  [Autenticación](#autenticación)).

```bash
docker compose up -d --build
```

- Frontend: <http://localhost:3000>
- API: <http://localhost:4000> (Socket.IO en la misma URL)

En modo local, crear el primer admin (ver [Autenticación](#autenticación)):

```bash
docker compose exec backend npm run auth:admin -- create-admin --email admin@example.com
```

Notas:

- Las URLs con las que el navegador llega a la API (`PUBLIC_API_URL`, `PUBLIC_SOCKET_URL`) se
  embeben en el build del frontend. Si se cambian los puertos o se publica detrás de un dominio,
  hay que actualizarlas en `.env` y reconstruir con `docker compose build frontend`.
- `CORS_ORIGIN` tiene que ser el origen con el que se abre el frontend (por defecto
  `http://localhost:3000`). Detrás de un proxy inverso, ajustar también `TRUST_PROXY` (ver
  [SECURITY.md](SECURITY.md#reverse-proxy-e-ip-del-cliente)).
- Los archivos subidos quedan en el volumen `uploads`, y la base de datos en `postgres-data`.
- Ver logs: `docker compose logs -f backend`. Bajar todo: `docker compose down`. Bajar y
  **borrar los datos**: `docker compose down -v`.

## Desarrollo local (sin Docker)

1. Instalar dependencias. El `postinstall` del backend genera el cliente de Prisma:

   ```bash
   npm ci
   ```

2. Tener un PostgreSQL disponible. Por ejemplo, con Docker:

   ```bash
   docker run -d --name link-postgres -e POSTGRES_USER=link -e POSTGRES_PASSWORD=link -e POSTGRES_DB=link -p 5432:5432 postgres:17-alpine
   ```

3. Configurar el entorno:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   ```

   En `backend/.env`, completar las claves VAPID y la autenticación. El `DATABASE_URL` de ejemplo
   ya apunta al contenedor del paso 2.

4. Aplicar las migraciones:

   ```bash
   npm run db:migrate
   ```

5. En modo local, crear el primer admin:

   ```bash
   npm run auth:admin:dev --workspace=backend -- create-admin --email admin@example.com
   ```

6. Levantar backend (puerto 4000) y frontend (puerto 3000) juntos:

   ```bash
   npm run dev
   ```

### Tests y build

```bash
npm test                                    # tests de backend y frontend (Vitest)
npm run test:coverage --workspace=backend   # con cobertura
npm run build                               # build de backend (tsc) y frontend (next build)
```

## Variables de entorno

Cada archivo `.env.example` documenta sus variables en detalle:

| Archivo | Para qué |
|---|---|
| [`.env.example`](.env.example) | `docker compose` |
| [`backend/.env.example`](backend/.env.example) | Backend sin Docker (`backend/.env`) |
| [`frontend/.env.example`](frontend/.env.example) | Frontend sin Docker (`frontend/.env.local`) |

Las más importantes del backend:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | sí | Conexión a PostgreSQL. |
| `EXTERNAL_AUTH_API_URL`, `APP_CODE_EXTERNAL_AUTH`, `EXTERNAL_AUTH_JWT_SECRET` | según el modo | Las tres activan el modo EXTERNAL_AUTH. |
| `LOCAL_AUTH_JWT_SECRET` | según el modo | Sin EXTERNAL_AUTH, activa el modo local. 32 caracteres o más. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | sí | Notificaciones push. Con claves inválidas el backend no arranca. |
| `CORS_ORIGIN` | en producción | Origen(es) del frontend, separados por coma. Con `NODE_ENV=production` es obligatoria (sin ella el backend no arranca); `*` acepta cualquier origen a propósito. Fuera de producción, sin definir acepta cualquier origen. |
| `TRUST_PROXY` | no | Proxies delante del backend: `1` (por defecto), `2`, o `false` si el backend está expuesto directo. Ver [SECURITY.md](SECURITY.md#reverse-proxy-e-ip-del-cliente). |
| `TRUST_CF_CONNECTING_IP` | no | `true` solo si todo el tráfico entra por Cloudflare. Por defecto `false`. |
| `FILE_URL_SIGNING_SECRET` | recomendada | Firma de las URLs de archivos. Sin definir, usa el secreto JWT del modo activo. |
| `GIPHY_API_KEY` | no | GIFs/stickers vía GIPHY. Sin definir quedan deshabilitados. Antes de activarlos, ver [Requisitos de GIPHY](backend/src/modules/giphy/README.md#requisitos-de-giphy). |
| `STORAGE_WRITE_PROVIDER`, `S3_*` | no | Almacenamiento en disco (`LOCAL`, por defecto) o S3. |
| `LOG_LEVEL`, `LOG_PRETTY` | no | Nivel y formato del log (JSON por defecto). |

El frontend solo necesita `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SOCKET_URL`, que se embeben al
hacer el build.

La configuración funcional (límites de subida, permisos de grupos, retención de mensajes,
auditoría, etc.) **no** va en el `.env`: se edita desde el panel de administración y se guarda en
la base.

## Autenticación

El modo se deduce de las variables de entorno del backend:

- **EXTERNAL_AUTH** (las tres `EXTERNAL_AUTH_*` definidas): el login se delega en un servicio de identidad
  externo compatible con EXTERNAL_AUTH, que emite un JWT HS256. LINK verifica ese token, crea o actualiza
  el perfil local del usuario, y toma los roles (por ejemplo `admin`) del token. Los detalles del
  contrato están en [`backend/src/modules/auth/README.md`](backend/src/modules/auth/README.md).
- **Local** (ninguna `EXTERNAL_AUTH_*`, con `LOCAL_AUTH_JWT_SECRET`): las cuentas y sus contraseñas viven
  en la base de LINK. Se inicia sesión con el correo o el nombre de usuario.
  - El primer admin se crea por terminal con `npm run auth:admin -- create-admin --email <correo>`
    (con Docker, `docker compose exec backend npm run auth:admin -- …`; sin compilar,
    `auth:admin:dev`). La contraseña temporal se muestra **una sola vez** y hay que cambiarla al
    entrar. `reset-password --email <correo>` restablece la de cualquier cuenta, por ejemplo si el
    único admin olvidó la suya.
  - Desde el panel de administración, un admin crea y edita cuentas, restablece contraseñas,
    desbloquea y desactiva cuentas, y define la duración de la sesión y la política de contraseñas
    (largo mínimo, composición, vencimiento, historial y bloqueo por intentos fallidos).
  - Detalles en [`backend/src/modules/auth/README.md`](backend/src/modules/auth/README.md) y en
    [`docs/design/LOCAL_AUTH_PLAN.md`](docs/design/LOCAL_AUTH_PLAN.md).

En los dos modos un admin puede desactivar el acceso de una cuenta al chat. Con solo una o dos
`EXTERNAL_AUTH_*`, el backend no arranca, para no caer por error en el modo local. Para pasar una
instalación existente de un modo al otro, ver
[LOCAL_AUTH_PLAN.md §10](docs/design/LOCAL_AUTH_PLAN.md#10-cambiar-de-modo-en-una-instalación-existente).

## Base de datos y migraciones

El esquema vive en [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) y se aplica con
migraciones de Prisma (`backend/prisma/migrations/`):

| Comando | Uso |
|---|---|
| `npm run db:migrate` | Aplica las migraciones pendientes (instalaciones nuevas, despliegues). |
| `npm run db:migrate:dev` | Desarrollo: crea una migración nueva a partir de cambios en `schema.prisma`. |
| `npm run db:baseline` | Solo una vez, en instalaciones creadas antes de las migraciones (ver abajo). |

No hace falta ningún *seed*: la fila de configuración global se crea sola en el primer arranque.
Los usuarios se crean al iniciar sesión (modo EXTERNAL_AUTH).

**Instalaciones existentes creadas con `prisma db push`.** Antes de usar migraciones hay que
marcar la migración inicial como ya aplicada, sin ejecutarla ni tocar datos:

```bash
cd backend
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma   # debe decir "No difference detected"
npm run db:baseline
npm run db:migrate                                                                  # "No pending migrations to apply"
```

Si `migrate diff` muestra diferencias, la base no coincide con el esquema actual: revisarlas
antes de seguir. Hacer un backup antes de cualquiera de estos pasos.

**Backup antes de actualizar.** Algunas migraciones cambian datos y no se pueden deshacer. La
`20261008120000_purge_deleted_message_content` borra de forma permanente el texto, las encuestas y
la relación con los archivos de los mensajes que ya estaban eliminados (los archivos en sí no se
borran: los libera la limpieza de archivos huérfanos, si está activada). Antes de actualizar una
instalación existente, hacer un backup de la base:

```bash
# Con Docker (usuario y base por defecto del docker-compose.yml)
docker compose exec -T postgres pg_dump -U link -Fc link > link-backup.dump

# Sin Docker
pg_dump --format=custom --file=link-backup.dump "$DATABASE_URL"
```

## Producción sin Docker

```bash
npm ci
NEXT_PUBLIC_API_URL=https://api.example.com/api NEXT_PUBLIC_SOCKET_URL=https://api.example.com npm run build
npm run db:migrate
pm2 start ecosystem.config.js   # o: npm start
```

- El backend tiene que correr como **una sola instancia**: Socket.IO no tiene un adapter
  compartido (Redis), así que con varias instancias los eventos no llegarían a todos los clientes.
- `ecosystem.config.js` arranca el backend con `NODE_ENV=production`, así que `CORS_ORIGIN` es
  obligatoria en `backend/.env`.
- Si hay un proxy inverso delante, definir `TRUST_PROXY` (y `TRUST_CF_CONNECTING_IP` si el tráfico
  entra por Cloudflare) según [SECURITY.md](SECURITY.md#reverse-proxy-e-ip-del-cliente).

## Almacenamiento S3

Por defecto los archivos se guardan en disco (`backend/uploads`, o el volumen `uploads` con
Docker). Con ese almacenamiento, el tamaño máximo de un archivo es **32 MB**, sin importar lo que
se configure en el panel de administración: la subida por partes de archivos grandes (hasta 2 GB
por defecto) necesita S3. Para usar un servicio compatible con S3:

- Definir `STORAGE_WRITE_PROVIDER=S3` y las variables `S3_*`.
- El navegador sube y descarga **directo** contra `S3_ENDPOINT` con URLs firmadas, así que esa URL
  tiene que ser alcanzable igual desde el backend y desde el navegador. Por ejemplo, un dominio
  propio, no un nombre interno de Docker.
- El bucket necesita CORS que permita `GET`, `PUT` y `HEAD` desde el origen del frontend y que
  exponga el header `ETag`.

Los archivos que ya están en disco se pueden migrar a S3 desde el panel de administración. El
diseño completo está en [`docs/design/LARGE_FILES_PLAN.md`](docs/design/LARGE_FILES_PLAN.md).

## Estructura

```
.
├── backend/                 # API Express + Socket.IO + Prisma
│   ├── prisma/              # schema.prisma y migraciones
│   ├── src/modules/         # un módulo por dominio, cada uno con su README
│   ├── src/socket/          # gateway y registro de eventos en tiempo real
│   ├── src/workers/         # tareas periódicas (retención, limpieza, migración de archivos)
│   └── API.md               # referencia de la API para el frontend
├── frontend/                # Next.js (App Router)
│   └── src/features/        # una carpeta por funcionalidad (api, components, hooks, types)
├── docs/design/             # documentos de diseño de cada iniciativa
├── scripts/                 # sincronizar la versión y generar el sonido de notificación
├── docker-compose.yml
└── ecosystem.config.js      # PM2 (producción sin Docker)
```

Documentación técnica:

- [`backend/README.md`](backend/README.md): arquitectura y modelo de datos.
- [`backend/API.md`](backend/API.md): referencia de la API y de los eventos de socket.
- Los `README.md` de cada módulo en `backend/src/modules/`.
- [`docs/design/`](docs/design/): decisiones de diseño (logging y auditoría, archivos grandes,
  testing, autenticación local).

## Estado del proyecto

Limitaciones de seguridad conocidas (el detalle está en
[SECURITY.md](SECURITY.md#limitaciones-conocidas)):

- El directorio de usuarios muestra el correo de todas las cuentas activas, y los avatares se
  descargan sin autenticación.
- Los mensajes no tienen cifrado de extremo a extremo.
- Las notificaciones push llevan el texto del mensaje, y siguen activas si la sesión vence sin
  cerrar sesión.
- Las URLs firmadas de archivos valen 1 hora y son portadoras.
- La restricción de tipos de archivo mira el contenido real solo de los formatos con firma conocida;
  los formatos de texto se validan por el tipo declarado.
- El token de sesión vive en `localStorage` y la CSP no restringe scripts.
- Los límites de frecuencia viven en memoria: el backend tiene que correr como una sola instancia.

## Contribuir y seguridad

- [CONTRIBUTING.md](CONTRIBUTING.md): cómo preparar el entorno, convenciones y reglas de tests.
- [SECURITY.md](SECURITY.md): cómo reportar vulnerabilidades y recomendaciones de despliegue.
- [CHANGELOG.md](CHANGELOG.md) y [VERSIONING.md](VERSIONING.md): historial y proceso de versiones.

## Licencia

Copyright © 2026 Anderson Frias.

LINK es software libre bajo la [GNU Affero General Public License v3.0](LICENSE), solo esa versión
(`AGPL-3.0-only`). En la práctica, se puede usar, estudiar, modificar y redistribuir. Quien
distribuya una versión modificada, o la ofrezca a otras personas a través de una red (por ejemplo,
una instalación de LINK con cambios propios que usa un equipo), tiene que ofrecerles el código
fuente de esa versión bajo la misma licencia. El texto de [LICENSE](LICENSE) es el que vale: este
resumen no lo reemplaza.

El contenido de terceros (diseños de avatares, tipografías, íconos y dependencias con licencias
a tener en cuenta) está en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

El nombre LINK, el logo y los íconos son assets de marca y se tratan aparte del código: no quedan
cubiertos por la AGPL. La lista de archivos está en
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md#marca-nombre-logo-e-íconos).
