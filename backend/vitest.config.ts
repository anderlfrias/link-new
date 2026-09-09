import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // config/env.ts hace process.exit(1) si falta alguna de estas al importarse
    // (ver testing-plan/00-infrastructure-setup.md) — se setean acá para que
    // cualquier test que importe código del backend no mate el proceso entero.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      PORT: "4000",
      EXTERNAL_AUTH_API_URL: "https://external-auth.test.local",
      APP_CODE_EXTERNAL_AUTH: "test-app-code",
      EXTERNAL_AUTH_JWT_SECRET: "test-jwt-secret",
      MAX_UPLOAD_SIZE_MB: "25",
      VAPID_PUBLIC_KEY: "test-vapid-public-key",
      VAPID_PRIVATE_KEY: "test-vapid-private-key",
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/**/*.test.ts", "src/server.ts"],
    },
  },
});
