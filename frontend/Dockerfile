# syntax=docker/dockerfile:1
#
# Imagen del frontend (Next.js). El contexto de build es la RAÍZ del repo
# (npm workspaces: el package-lock.json es uno solo, en la raíz):
#
#   docker build -f frontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api \
#     --build-arg NEXT_PUBLIC_SOCKET_URL=https://api.example.com \
#     -t link-frontend .
#
# Las NEXT_PUBLIC_* se embeben en el bundle durante el build: cambiarlas
# requiere reconstruir la imagen, no alcanza con reiniciar el contenedor.

FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

# Solo dependencias de producción: es lo que se copia a la imagen final.
FROM base AS prod-deps
# frontend/node_modules existe solo si npm no pudo subir algún paquete a la
# raíz; se crea vacío para que el COPY de la etapa final no falle.
RUN mkdir -p frontend/node_modules && npm ci --omit=dev --workspace=frontend

# Build de Next.js, con las dependencias de desarrollo (TypeScript, Tailwind).
FROM base AS build
RUN npm ci --workspace=frontend
COPY frontend/ frontend/
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
  NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
  NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=frontend && rm -rf frontend/.next/cache

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/frontend/node_modules ./frontend/node_modules
# `next start` solo necesita el build, los archivos de public/ y la config.
COPY --from=build /app/frontend/.next ./frontend/.next
COPY --from=build /app/frontend/public ./frontend/public
COPY --from=build /app/frontend/package.json /app/frontend/next.config.ts /app/frontend/tsconfig.json ./frontend/
WORKDIR /app/frontend
USER node
EXPOSE 3000
CMD ["npm", "start"]
