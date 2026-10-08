import { afterEach, beforeEach } from "vitest";
import type { AuthConfig } from "../config/auth-config";
import env from "../config/env";

/// Mismo secreto de sesión que define vitest.config.ts (SESSION_JWT_SECRET), de 32
/// caracteres o más: así un token firmado con `env.auth.sessionSecret` verifica en
/// cualquiera de los dos modos.
export const TEST_SESSION_JWT_SECRET = "test-session-jwt-secret-0123456789abcdef";

export const LOCAL_AUTH_CONFIG: AuthConfig = {
  mode: "local",
  sessionSecret: TEST_SESSION_JWT_SECRET,
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
