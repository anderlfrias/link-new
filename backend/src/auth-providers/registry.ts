import { ServiceUnavailableError } from "../utils/errors";
import type { AuthProvider } from "./api";

/// El proveedor de autenticación externo de la instalación, o `null` si usa cuentas
/// locales (el modo integrado, y el de siempre sin configuración). Una instalación
/// usa uno u otro, nunca los dos a la vez. Lo fija `initAuthProvider` (init.ts) al
/// arrancar, antes de escuchar; este archivo no importa nada más del core a propósito,
/// para que cualquier módulo pueda preguntar sin crear ciclos.
let current: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider | null {
  return current;
}

/// Solo para `initAuthProvider` y los tests.
export function setAuthProvider(provider: AuthProvider | null): void {
  current = provider;
}

export function isExternalProvider(): boolean {
  return current !== null;
}

/// Id del proveedor activo, o "local" con cuentas locales: es lo que se guarda como
/// `provider` en la auditoría y lo que devuelve la API en `authProvider`.
export function currentProviderId(): string {
  return current?.id ?? "local";
}

/// Guarda para el código que solo tiene sentido con cuentas locales (login local,
/// administrar contraseñas, alta de cuentas). Con un proveedor externo tira.
export function requireLocalAuth(): void {
  if (current !== null) {
    throw new ServiceUnavailableError(
      "Las cuentas locales no están habilitadas en esta instalación.",
      "local_auth_not_enabled",
    );
  }
}
