import { isAbsolute } from "node:path";
import { AUTH_PROVIDER_API_VERSION, AuthProvider } from "./api";
import { createProviderContext } from "./context";

/// La configuración del proveedor es inválida o no se pudo cargar. Su mensaje es lo que
/// ve quien administra la instalación al arrancar: dice qué falló y qué mirar.
export class AuthProviderLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthProviderLoadError";
  }
}

/// Nombre de paquete de npm, con scope y subruta opcionales. Una ruta relativa no vale: su
/// significado depende de desde dónde se arranca el proceso.
const PACKAGE_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w./-]+)?$/i;

/// El id se guarda en `User.identityProvider` y en la auditoría. "local" es de las cuentas propias.
const PROVIDER_ID = /^[a-z0-9][a-z0-9_-]*$/;

const RESERVED_IDS = ["local"];

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/// `AUTH_PROVIDER_MODULE`: una ruta absoluta a un archivo JavaScript (CommonJS) o el nombre de
/// un paquete que se resuelva desde `backend/`.
function validateModuleRef(moduleRef: string): void {
  if (moduleRef.startsWith("builtin:")) {
    throw new AuthProviderLoadError(
      `AUTH_PROVIDER_MODULE "${moduleRef}": the "builtin:" prefix is reserved and there are no built-in providers yet.`,
    );
  }
  if (!isAbsolute(moduleRef) && !PACKAGE_NAME.test(moduleRef)) {
    throw new AuthProviderLoadError(
      `AUTH_PROVIDER_MODULE "${moduleRef}" is neither an absolute path nor a package name. A relative path depends on where the process starts: use an absolute path.`,
    );
  }
}

type LoadedModule = Record<string, unknown>;
type Factory = (ctx: unknown) => unknown;

type Root = LoadedModule | Factory;

function isFactory(root: unknown): root is Factory {
  return typeof root === "function";
}

/// Un objeto con alguna de las propiedades de un proveedor: aunque le falte algo, se lo valida y el
/// mensaje dice qué (en vez de un genérico "no exporta un proveedor").
function looksLikeProvider(root: unknown): root is LoadedModule {
  return (
    typeof root === "object" &&
    root !== null &&
    ("authenticate" in root || "id" in root || "apiVersion" in root || "displayName" in root)
  );
}

/// Qué exporta el módulo. Se busca en el propio módulo, en su `default` y en el `default` de ese
/// (un módulo CommonJS con `exports.default` queda así al importarlo), y en cada nivel vale, en este
/// orden: `createAuthProvider(ctx)`; una función (un default que crea el proveedor); un objeto que ya
/// es el proveedor.
async function instantiate(mod: LoadedModule, ctx: unknown, moduleRef: string): Promise<unknown> {
  const first = mod.default as Root | undefined;
  const second = first && typeof first === "object" ? ((first as LoadedModule).default as Root | undefined) : undefined;
  const roots = [mod, first, second].filter((root): root is Root => root !== undefined && root !== null);

  const create = async (factory: Factory) => {
    try {
      return await factory(ctx);
    } catch (error) {
      throw new AuthProviderLoadError(`AUTH_PROVIDER_MODULE "${moduleRef}": createAuthProvider() failed: ${describe(error)}`);
    }
  };

  for (const root of roots) {
    const factory = (root as LoadedModule).createAuthProvider;
    if (isFactory(factory)) return create(factory);
  }
  for (const root of roots) {
    if (isFactory(root)) return create(root);
    if (looksLikeProvider(root)) return root;
  }

  throw new AuthProviderLoadError(
    `AUTH_PROVIDER_MODULE "${moduleRef}" does not export an auth provider: export a createAuthProvider(ctx) function or an object with authenticate().`,
  );
}

function validate(candidate: unknown, moduleRef: string): AuthProvider {
  const fail = (reason: string) =>
    new AuthProviderLoadError(`AUTH_PROVIDER_MODULE "${moduleRef}" is not a valid auth provider: ${reason}`);

  if (candidate === null || typeof candidate !== "object") throw fail("it did not return an object");
  const provider = candidate as Partial<AuthProvider>;

  if (typeof provider.id !== "string" || provider.id.trim() === "") throw fail("missing id");
  if (!PROVIDER_ID.test(provider.id)) {
    throw fail(`id "${provider.id}" must be lowercase letters, digits, "-" or "_" (it is stored in the database and in the audit log)`);
  }
  if (RESERVED_IDS.includes(provider.id)) throw fail(`the id "${provider.id}" is reserved`);
  if (typeof provider.displayName !== "string" || provider.displayName.trim() === "") throw fail("missing displayName");
  if (provider.apiVersion !== AUTH_PROVIDER_API_VERSION) {
    throw fail(
      `it implements auth provider API version ${String(provider.apiVersion)} but this LINK supports version ${AUTH_PROVIDER_API_VERSION}: use a plugin built for this LINK version`,
    );
  }
  if (typeof provider.authenticate !== "function") throw fail("authenticate is not a function");
  if (provider.init !== undefined && typeof provider.init !== "function") throw fail("init is not a function");
  if (provider.onLogin !== undefined && typeof provider.onLogin !== "function") throw fail("onLogin is not a function");

  return provider as AuthProvider;
}

/// Carga el proveedor de `AUTH_PROVIDER_MODULE`, lo valida y le pide que valide su propia
/// configuración (`init`). Cualquier falla lanza `AuthProviderLoadError`: el backend no arranca
/// y el mensaje dice por qué, en lugar de fallar en silencio en el primer login.
///
/// El módulo corre dentro del proceso del backend, con sus mismos permisos: es código de quien
/// administra la instalación, igual que el `.env`.
export async function loadAuthProvider(moduleRef: string): Promise<AuthProvider> {
  validateModuleRef(moduleRef);

  let loaded: LoadedModule;
  try {
    loaded = (await import(moduleRef)) as LoadedModule;
  } catch (error) {
    throw new AuthProviderLoadError(`AUTH_PROVIDER_MODULE "${moduleRef}" could not be loaded: ${describe(error)}`);
  }

  // El contexto existe antes que el proveedor (se lo pasa `createAuthProvider`), pero lo que guarda lo
  // marca con el id del proveedor: se resuelve recién cuando se lo usa, ya con el proveedor creado.
  let provider: AuthProvider | undefined;
  const ctx = createProviderContext(() => {
    if (!provider) throw new Error("ProviderContext.users cannot be used before the provider is created");
    return provider.id;
  });

  provider = validate(await instantiate(loaded, ctx, moduleRef), moduleRef);

  try {
    await provider.init?.(ctx);
  } catch (error) {
    throw new AuthProviderLoadError(`The "${provider.id}" auth provider could not start: ${describe(error)}`);
  }
  return provider;
}
