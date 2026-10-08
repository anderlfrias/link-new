import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROVIDER_API_VERSION } from "./api";

// El contexto real habla con la base: acá solo importa a quién se lo pasa el loader y cuándo se
// resuelve el id del proveedor.
vi.mock("./context", () => ({
  createProviderContext: vi.fn((provider: string | (() => string)) => ({ provider, marker: "ctx" })),
}));

import { createProviderContext } from "./context";
import { AuthProviderLoadError, loadAuthProvider } from "./loader";

const dir = mkdtempSync(join(tmpdir(), "link-auth-provider-"));
let counter = 0;

/// Escribe un módulo CommonJS como el que distribuye un plugin y devuelve su ruta absoluta.
function plugin(source: string): string {
  counter += 1;
  const file = join(dir, `plugin-${counter}.cjs`);
  writeFileSync(file, source);
  return file;
}

// Entre paréntesis: así vale tanto como cuerpo de una flecha como dentro de un spread.
const VALID = `({ id: "mi-proveedor", displayName: "Mi Proveedor", apiVersion: ${AUTH_PROVIDER_API_VERSION}, authenticate: async () => ({}) })`;

afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
  vi.clearAllMocks();
});

async function failure(promise: Promise<unknown>): Promise<AuthProviderLoadError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AuthProviderLoadError) return error;
    throw error;
  }
  throw new Error("se esperaba un AuthProviderLoadError");
}

describe("loadAuthProvider — qué se acepta como AUTH_PROVIDER_MODULE", () => {
  it("una ruta relativa se rechaza: depende de desde dónde arranca el proceso", async () => {
    const error = await failure(loadAuthProvider("./plugins/mi-proveedor.cjs"));

    expect(error.message).toContain("neither an absolute path nor a package name");
    expect(error.message).toContain("./plugins/mi-proveedor.cjs");
  });

  it("el prefijo builtin: está reservado para proveedores integrados que todavía no existen", async () => {
    const error = await failure(loadAuthProvider("builtin:ldap"));

    expect(error.message).toContain("reserved");
  });

  it("una ruta absoluta a un módulo que no existe dice cuál es y que no se pudo cargar", async () => {
    const missing = join(dir, "no-existe.cjs");

    const error = await failure(loadAuthProvider(missing));

    expect(error.message).toContain(`AUTH_PROVIDER_MODULE "${missing}" could not be loaded`);
  });

  it("un paquete que no está instalado también dice que no se pudo cargar", async () => {
    const error = await failure(loadAuthProvider("link-auth-paquete-que-no-existe"));

    expect(error.message).toContain("could not be loaded");
  });

  it("un módulo con un error de sintaxis dice que no se pudo cargar, con el motivo", async () => {
    const error = await failure(loadAuthProvider(plugin("module.exports = {{{ esto no es javascript")));

    expect(error.message).toContain("could not be loaded");
  });

  it("un módulo que lanza al cargarse dice que no se pudo cargar, con el motivo", async () => {
    const error = await failure(loadAuthProvider(plugin(`throw new Error("falta una dependencia")`)));

    expect(error.message).toContain("could not be loaded");
    expect(error.message).toContain("falta una dependencia");
  });
});

describe("loadAuthProvider — qué exporta el módulo", () => {
  it("createAuthProvider(ctx): recibe el contexto y su resultado es el proveedor", async () => {
    const file = plugin(`exports.createAuthProvider = (ctx) => ({ ...${VALID}, receivedCtx: ctx });`);

    const provider = await loadAuthProvider(file);

    expect(provider.id).toBe("mi-proveedor");
    expect((provider as unknown as { receivedCtx: { marker: string } }).receivedCtx.marker).toBe("ctx");
  });

  it("createAuthProvider puede ser asíncrona", async () => {
    const file = plugin(`exports.createAuthProvider = async () => ${VALID};`);

    await expect(loadAuthProvider(file)).resolves.toMatchObject({ id: "mi-proveedor" });
  });

  it("un objeto proveedor exportado directamente", async () => {
    const file = plugin(`module.exports = ${VALID};`);

    await expect(loadAuthProvider(file)).resolves.toMatchObject({ id: "mi-proveedor" });
  });

  it("un default que es una función que crea el proveedor", async () => {
    const file = plugin(`module.exports = { default: () => ${VALID} };`);

    await expect(loadAuthProvider(file)).resolves.toMatchObject({ id: "mi-proveedor" });
  });

  it("un default que es un objeto proveedor", async () => {
    const file = plugin(`module.exports = { default: ${VALID} };`);

    await expect(loadAuthProvider(file)).resolves.toMatchObject({ id: "mi-proveedor" });
  });

  it("un módulo que no exporta nada que sirva dice qué hay que exportar", async () => {
    const error = await failure(loadAuthProvider(plugin(`module.exports = { algo: 1 };`)));

    expect(error.message).toContain("does not export an auth provider");
    expect(error.message).toContain("createAuthProvider");
  });

  it("si createAuthProvider lanza, el error dice cuál fue", async () => {
    const error = await failure(loadAuthProvider(plugin(`exports.createAuthProvider = () => { throw new Error("config rota"); };`)));

    expect(error.message).toContain("createAuthProvider() failed: config rota");
  });

  it("si createAuthProvider no devuelve un objeto, no es un proveedor", async () => {
    const error = await failure(loadAuthProvider(plugin(`exports.createAuthProvider = () => 42;`)));

    expect(error.message).toContain("did not return an object");
  });
});

describe("loadAuthProvider — validación del proveedor", () => {
  const provider = (overrides: string) => plugin(`module.exports = { ...${VALID}, ${overrides} };`);

  it.each([
    ["sin id", `id: undefined`, "missing id"],
    ["con el id vacío", `id: "  "`, "missing id"],
    ["con un id con mayúsculas o espacios", `id: "Mi Proveedor"`, "must be lowercase"],
    ["con el id reservado de las cuentas locales", `id: "local"`, 'the id "local" is reserved'],
    ["sin displayName", `displayName: undefined`, "missing displayName"],
    ["sin authenticate", `authenticate: undefined`, "authenticate is not a function"],
    ["con un init que no es una función", `init: "no"`, "init is not a function"],
    ["con un onLogin que no es una función", `onLogin: 7`, "onLogin is not a function"],
  ])("%s es inválido y el mensaje dice por qué", async (_label, overrides, message) => {
    const error = await failure(loadAuthProvider(provider(overrides)));

    expect(error.message).toContain("is not a valid auth provider");
    expect(error.message).toContain(message);
  });

  it("una versión de la interfaz distinta: no arranca, y el mensaje dice la del plugin y la que soporta LINK", async () => {
    const error = await failure(loadAuthProvider(provider(`apiVersion: ${AUTH_PROVIDER_API_VERSION + 1}`)));

    expect(error.message).toContain(`API version ${AUTH_PROVIDER_API_VERSION + 1}`);
    expect(error.message).toContain(`supports version ${AUTH_PROVIDER_API_VERSION}`);
  });

  it("sin versión de la interfaz tampoco arranca (un plugin viejo o mal armado)", async () => {
    const error = await failure(loadAuthProvider(provider(`apiVersion: undefined`)));

    expect(error.message).toContain("API version undefined");
  });
});

describe("loadAuthProvider — init", () => {
  it("llama a init con el mismo contexto, antes de devolver el proveedor", async () => {
    const file = plugin(`
      let initialized = false;
      exports.createAuthProvider = (ctx) => ({
        ...${VALID},
        init(initCtx) { initialized = initCtx === ctx; },
        get initializedWithSameCtx() { return initialized; },
      });
    `);

    const provider = await loadAuthProvider(file);

    expect((provider as unknown as { initializedWithSameCtx: boolean }).initializedWithSameCtx).toBe(true);
  });

  it("espera a un init asíncrono", async () => {
    const file = plugin(`
      let ready = false;
      module.exports = { ...${VALID}, init: async () => { await new Promise((r) => setTimeout(r, 5)); ready = true; }, get ready() { return ready; } };
    `);

    const provider = await loadAuthProvider(file);

    expect((provider as unknown as { ready: boolean }).ready).toBe(true);
  });

  it("si init lanza, el backend no arranca y el mensaje dice qué proveedor y por qué", async () => {
    const file = plugin(`module.exports = { ...${VALID}, init() { throw new Error("Missing MI_PROVEEDOR_URL"); } };`);

    const error = await failure(loadAuthProvider(file));

    expect(error.message).toBe('The "mi-proveedor" auth provider could not start: Missing MI_PROVEEDOR_URL');
  });

  it("si init rechaza (asíncrono), pasa lo mismo", async () => {
    const file = plugin(`module.exports = { ...${VALID}, init: async () => { throw new Error("no hay secreto"); } };`);

    const error = await failure(loadAuthProvider(file));

    expect(error.message).toContain("could not start: no hay secreto");
  });
});

describe("loadAuthProvider — el contexto que recibe el plugin", () => {
  function contextId(): () => string {
    const [[provider]] = vi.mocked(createProviderContext).mock.calls;
    return provider as () => string;
  }

  it("lo que guarda el contexto lo marca con el id del proveedor, resuelto recién cuando se lo usa", async () => {
    const file = plugin(`exports.createAuthProvider = () => ${VALID};`);

    await loadAuthProvider(file);

    expect(contextId()()).toBe("mi-proveedor");
  });

  it("usar el contexto antes de que el proveedor exista falla con un mensaje claro", async () => {
    // Un plugin que usa `ctx.users` mientras se está creando todavía no tiene id con el que marcar lo que guarda.
    const eager = plugin(`exports.createAuthProvider = (ctx) => { ctx.resolveId(); return ${VALID}; };`);
    vi.mocked(createProviderContext).mockImplementationOnce(((provider: () => string) => ({ resolveId: provider })) as never);

    const error = await failure(loadAuthProvider(eager));

    expect(error.message).toContain("cannot be used before the provider is created");
  });
});
