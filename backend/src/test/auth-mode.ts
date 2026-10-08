import { afterEach, beforeEach, vi } from "vitest";
import { AUTH_PROVIDER_API_VERSION, AuthProvider } from "../auth-providers/api";
import { getAuthProvider, setAuthProvider } from "../auth-providers/registry";

/// Mismo secreto de sesión que define vitest.config.ts (SESSION_JWT_SECRET), de 32
/// caracteres o más: así un token firmado con `env.auth.sessionSecret` verifica en
/// cualquiera de los dos modos.
export const TEST_SESSION_JWT_SECRET = "test-session-jwt-secret-0123456789abcdef";

/// Un proveedor externo de mentira, sin lógica propia: cada test que lo necesita
/// le pone el comportamiento que quiere en `authenticate`/`onLogin`.
export function createFakeProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    id: "external-test",
    displayName: "External Test",
    apiVersion: AUTH_PROVIDER_API_VERSION,
    authenticate: vi.fn(),
    ...overrides,
  };
}

/// Pone la instalación con ese proveedor externo (o con cuentas locales, `null`)
/// durante cada test del `describe` que lo llama, y restaura el de `setup.ts` al
/// terminar. El proveedor activo se consulta en cada request, no al importar, así que
/// alcanza con reemplazarlo: no hace falta `vi.resetModules`.
function useProvider(provider: () => AuthProvider | null): void {
  let original: AuthProvider | null;
  beforeEach(() => {
    original = getAuthProvider();
    setAuthProvider(provider());
  });
  afterEach(() => {
    setAuthProvider(original);
  });
}

/// Cuentas locales (el modo integrado).
export function useLocalAuth(): void {
  useProvider(() => null);
}

/// Un proveedor externo, el de mentira por defecto.
export function useExternalProvider(provider?: AuthProvider): void {
  useProvider(() => provider ?? createFakeProvider());
}
