# LINK — frontend

Aplicación Next.js (App Router) de LINK. La instalación completa, las variables de entorno y
Docker están en el [README principal](../README.md).

## Desarrollo

Desde la raíz del repo (npm workspaces):

```bash
cp frontend/.env.example frontend/.env.local
npm run dev:frontend        # http://localhost:3000
npm run test --workspace=frontend
npm run build --workspace=frontend
```

`NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SOCKET_URL` se embeben en el bundle al hacer el build:
cambiarlas requiere volver a construir.

## Estructura

- `src/app/`: rutas (App Router). Están en grupos `(auth)`, `(chat)` y `(admin)`.
- `src/features/<funcionalidad>/`: `api/`, `components/`, `hooks/` y `types/` de cada
  funcionalidad (mensajes, conversaciones, llamadas, administración…).
- `src/providers/`: contexto global (sesión, socket, tema, configuración pública).
- `src/components/`: UI compartida y layout.
- `src/i18n/`: traducciones (español e inglés).
- `public/`: íconos, marca, sonidos y el service worker de notificaciones push (`sw.js`).

Esta versión de Next.js tiene cambios incompatibles con versiones anteriores: antes de escribir
código nuevo, consultar la documentación incluida en `node_modules/next/dist/docs/` (ver
[AGENTS.md](AGENTS.md)).
