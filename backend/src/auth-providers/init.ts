import type { AuthProvider } from "./api";
import { loadAuthProvider } from "./loader";
import { setAuthProvider } from "./registry";

/// Qué módulo implementa el proveedor de autenticación de esta instalación, o `undefined` si usa
/// cuentas locales: `AUTH_PROVIDER_MODULE` (ruta absoluta o nombre de paquete).
export function authProviderModule(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.AUTH_PROVIDER_MODULE?.trim() || undefined;
}

/// ¿Hay un proveedor externo configurado en el entorno? Se decide sin cargarlo, para el CLI.
export function isExternalProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return authProviderModule(env) !== undefined;
}

/// Carga y valida el proveedor al arrancar, antes de escuchar. Si el módulo no existe, no exporta un
/// proveedor válido o su configuración es inválida, lanza: el backend no arranca. Sin proveedor
/// configurado deja las cuentas locales.
export async function initAuthProvider(env: NodeJS.ProcessEnv = process.env): Promise<AuthProvider | null> {
  const moduleRef = authProviderModule(env);
  if (!moduleRef) {
    setAuthProvider(null);
    return null;
  }
  const provider = await loadAuthProvider(moduleRef);
  setAuthProvider(provider);
  return provider;
}
