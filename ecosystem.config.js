// Config de PM2 para correr backend y frontend en producción.
//
// Requiere haber compilado antes (PM2 no builda por vos):
//   npm run build   (corre "build" en ambos workspaces — ver package.json de la raíz)
//
// Uso:
//   pm2 start ecosystem.config.js
//   pm2 logs            # ver logs de ambas apps
//   pm2 restart all     # tras un nuevo build
//   pm2 save && pm2 startup   # para que sobrevivan un reinicio del server
//
// Los `cwd` son relativos a este archivo (no a donde se ejecute `pm2`), así que
// siempre resuelven a backend/ y frontend/ sin importar desde dónde se invoque.
module.exports = {
  apps: [
    {
      name: "link-backend",
      cwd: "./backend",
      // node dist/server.js directo (no "npm run start") — evita el proceso
      // intermedio de npm y arranca más rápido en cada restart de PM2.
      script: "dist/server.js",
      // dotenv/config (backend/src/config/env.ts) carga backend/.env solo,
      // usando process.cwd() — por eso el `cwd` de arriba importa: si no
      // apunta a backend/, no encuentra el .env y el server no arranca.
      env: {
        NODE_ENV: "production",
      },
      // Socket.IO no tiene un adapter de Redis configurado (ver
      // src/socket/README.md) — con más de 1 instancia, los eventos solo
      // llegarían a los sockets conectados a esa instancia puntual. No poner
      // exec_mode "cluster" ni instances > 1 acá sin agregar ese adapter antes.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      time: true,
    },
    {
      name: "link-frontend",
      cwd: "./frontend",
      // Bin de Next directo (equivalente a "next start") — mismo motivo que
      // el backend: un proceso menos que "npm run start".
      script: "node_modules/next/dist/bin/next",
      args: "start",
      // Los NEXT_PUBLIC_* (frontend/.env.local) quedan embebidos en el bundle
      // al momento del build — cambiarlos acá o reiniciar con PM2 no alcanza,
      // hay que correr "npm run build --workspace=frontend" de nuevo.
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Next.js sí es stateless (sin Socket.IO) — a diferencia del backend,
      // subir `instances` acá es seguro si hace falta escalar.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      time: true,
    },
  ],
};
