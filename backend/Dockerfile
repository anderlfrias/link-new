# syntax=docker/dockerfile:1
#
# Imagen del backend (Express + Socket.IO + Prisma).
# El contexto de build es la RAÍZ del repo (npm workspaces: el package-lock.json
# es uno solo, en la raíz):
#
#   docker build -f backend/Dockerfile -t link-backend .
#
# Al arrancar aplica las migraciones pendientes (prisma migrate deploy) y
# levanta el server. Ver README.md, sección Docker.

# La imagen base va fijada por digest para que el mismo commit construya siempre lo mismo.
# Dependabot (docker) actualiza el tag y el digest juntos.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
# openssl: lo necesita el schema engine de Prisma para aplicar migraciones.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# El postinstall del backend corre `prisma generate`: necesita el schema y la
# config de Prisma antes de instalar.
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/prisma.config.ts

# Solo dependencias de producción: es lo que se copia a la imagen final. El CLI
# de Prisma es dependencia de producción porque `migrate deploy` corre al
# arrancar el contenedor.
FROM base AS prod-deps
# backend/node_modules existe solo si npm no pudo subir algún paquete a la raíz;
# se crea vacío para que el COPY de la etapa final no falle si no hace falta.
RUN mkdir -p backend/node_modules && npm ci --omit=dev --workspace=backend

# Build de TypeScript, con las dependencias de desarrollo.
FROM base AS build
RUN npm ci --workspace=backend
COPY backend/ backend/
RUN npm run build --workspace=backend

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
WORKDIR /app/backend
# Archivos subidos con STORAGE_WRITE_PROVIDER=LOCAL (montar como volumen).
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 4000
# /health, no /: además de que el proceso responda, comprueba la conexión con la base de datos.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "npm run db:migrate && exec node dist/server.js"]
