import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // config/env.ts hace process.exit(1) si falta alguna de estas al importarse
    // (ver docs/design/testing-plan/00-infrastructure-setup.md) — se setean acá para que
    // cualquier test que importe código del backend no mate el proceso entero.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      PORT: "4000",
      // Vacía a propósito: dotenv no pisa una variable ya definida, así que el .env de
      // quien corre los tests no puede configurar un proveedor externo.
      AUTH_PROVIDER_MODULE: "",
      // 32 caracteres o más: firma las sesiones de LINK en todos los modos.
      SESSION_JWT_SECRET: "test-session-jwt-secret-0123456789abcdef",
      MAX_UPLOAD_SIZE_MB: "25",
      VAPID_PUBLIC_KEY: "test-vapid-public-key",
      VAPID_PRIVATE_KEY: "test-vapid-private-key",
      VAPID_SUBJECT: "mailto:test@example.com",
      // silent: sin esto, cada test que importe código del backend escupe
      // logs y ensucia la salida de vitest hasta hacerla ilegible (ver
      // src/config/logger.ts y LOGGING_PLAN.md).
      LOG_LEVEL: "silent",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/**/*.test.ts", "src/server.ts"],
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 68,
      },
    },
  },
});
