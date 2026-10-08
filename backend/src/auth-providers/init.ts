import type { AuthProvider } from "./api";
import { createProviderContext } from "./context";
import { setAuthProvider } from "./registry";
import { createExternalUserProvider, isExternalUserRequested } from "./external-auth";

/// ¿Hay un proveedor externo configurado en el entorno? Se decide sin cargarlo, para
/// el CLI. Temporal (fase 3): hoy el único proveedor es el de EXTERNAL_AUTH, interno.
export function isExternalProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isExternalUserRequested(env);
}

/// Elige y valida el proveedor al arrancar, antes de escuchar. Si la configuración del
/// proveedor es inválida lanza: el backend no arranca. Sin proveedor configurado deja
/// las cuentas locales. Temporal (fase 3): hoy el único proveedor es el de EXTERNAL_AUTH,
/// interno; la fase 5 lo cambia por un loader de plugins.
export async function initAuthProvider(env: NodeJS.ProcessEnv = process.env): Promise<AuthProvider | null> {
  if (!isExternalProviderConfigured(env)) {
    setAuthProvider(null);
    return null;
  }
  const provider = createExternalUserProvider(env);
  await provider.init?.(createProviderContext(provider.id));
  setAuthProvider(provider);
  return provider;
}
