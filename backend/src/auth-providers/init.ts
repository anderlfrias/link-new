import { join } from "node:path";
import type { AuthProvider } from "./api";
import { loadAuthProvider } from "./loader";
import { setAuthProvider } from "./registry";
import { isExternalUserRequested } from "./external-auth";

/// El proveedor de EXTERNAL_AUTH, interno, cargado por la misma vía que cualquier plugin (`loader.ts`):
/// así el camino de los plugins se ejercita de verdad antes de sacarlo del repositorio.
/// Temporal (AUTH_PROVIDERS_PLAN, fase 6).
const INTERNAL_EXTERNAL_AUTH_MODULE = join(__dirname, "external-auth", "index");

/// Qué módulo implementa el proveedor de autenticación de esta instalación, o `undefined` si usa
/// cuentas locales. `AUTH_PROVIDER_MODULE` (ruta absoluta o nombre de paquete) manda; mientras el
/// de EXTERNAL_AUTH siga en el repositorio, sus variables bastan para elegirlo.
export function authProviderModule(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.AUTH_PROVIDER_MODULE?.trim();
  if (explicit) return explicit;
  return isExternalUserRequested(env) ? INTERNAL_EXTERNAL_AUTH_MODULE : undefined;
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
