import { afterEach, beforeEach } from "vitest";
import type { AuthConfig } from "../config/auth-config";
import env from "../config/env";

/// 40 caracteres: cumple el mínimo de 32 de LOCAL_AUTH_JWT_SECRET.
export const TEST_LOCAL_JWT_SECRET = "test-local-jwt-secret-0123456789abcdefgh";

export const LOCAL_AUTH_CONFIG: AuthConfig = {
  mode: "local",
  local: { jwtSecret: TEST_LOCAL_JWT_SECRET },
};

/// Pone la instalación en el modo dado durante cada test del `describe` que lo
/// llama, y restaura el de vitest.config.ts (external-auth) al terminar. `env.auth` se
/// lee en cada request, no al importar, así que alcanza con reemplazarlo: no
/// hace falta `vi.resetModules` (LOCAL_AUTH_PLAN.md, Fase 1).
export function useAuthMode(config: AuthConfig): void {
  let original: AuthConfig;
  beforeEach(() => {
    original = env.auth;
    env.auth = config;
  });
  afterEach(() => {
    env.auth = original;
  });
}
