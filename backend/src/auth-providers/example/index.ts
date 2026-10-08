// Proveedor de autenticación de EJEMPLO, con las credenciales en memoria.
//
// Sirve para dos cosas: mostrar cómo se escribe un proveedor (ver docs/auth-providers.md) y ser
// el plugin que los tests cargan con el loader real (`loader.ts`), de modo que un cambio del core
// que rompa la interfaz rompa el test de contrato (`example.test.ts`) antes que una instalación.
//
// NO es para producción: las contraseñas están escritas en el código. Por eso `init` se niega
// a arrancar con NODE_ENV=production.
//
// Como cualquier proveedor que viva fuera de LINK, solo depende de `../api` (el contrato público).
import {
  AUTH_PROVIDER_API_VERSION,
  AuthenticateResult,
  AuthProvider,
  AuthProviderError,
  CredentialsInput,
  LoginEvent,
  ProviderContext,
} from "../api";

interface ExampleUser {
  login: string;
  password: string;
  externalId: string;
  email: string;
  username: string;
  fullName: string;
  roles: string[];
  /// Una persona que el proveedor conoce pero a la que no deja entrar a esta aplicación.
  denied?: boolean;
}

export const EXAMPLE_USERS: readonly ExampleUser[] = [
  { login: "ana", password: "ana-pass", externalId: "ex-1", email: "ana@example.com", username: "ana", fullName: "Ana Admin", roles: ["admin", "rol-que-link-no-conoce"] },
  { login: "beto", password: "beto-pass", externalId: "ex-2", email: "beto@example.com", username: "beto", fullName: "Beto Pérez", roles: [] },
  { login: "denegado", password: "denegado-pass", externalId: "ex-3", email: "denegado@example.com", username: "denegado", fullName: "Sin Acceso", roles: [], denied: true },
];

export function createAuthProvider(_ctx: ProviderContext): AuthProvider {
  return {
    id: "example",
    displayName: "Example",
    apiVersion: AUTH_PROVIDER_API_VERSION,

    // Acá un proveedor real lee y valida SU configuración (variables de entorno, URLs, secretos): si
    // algo falta o es inválido, lanza y el backend no arranca.
    init() {
      if (process.env.NODE_ENV === "production") {
        throw new Error("The example auth provider is for tests and documentation only: its passwords are hard-coded.");
      }
    },

    async authenticate(input: CredentialsInput): Promise<AuthenticateResult> {
      const login = input.login.trim().toLowerCase();
      const user = EXAMPLE_USERS.find((candidate) => candidate.login === login || candidate.email === login);
      // Mismo error para "no existe" y "contraseña incorrecta": no se confirma qué cuentas hay.
      if (!user || user.password !== input.password) {
        throw new AuthProviderError("invalid_credentials");
      }
      if (user.denied) {
        throw new AuthProviderError("access_denied");
      }
      return {
        externalId: user.externalId,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        // Se informan todos; LINK se queda con los que conoce.
        roles: user.roles,
        // Lo que `onLogin` necesite de este momento (por ejemplo, el token del proveedor).
        providerData: { loggedInAs: user.login },
      };
    },

    // Corre después de crear la sesión, en segundo plano: un error se loguea y no rompe el login.
    async onLogin(event: LoginEvent, ctx: ProviderContext): Promise<void> {
      // Sincronizar el directorio: las personas que todavía no iniciaron sesión en LINK aparecen en la
      // lista de contactos.
      for (const user of EXAMPLE_USERS.filter((candidate) => !candidate.denied)) {
        await ctx.users.upsertExternalUser({
          externalId: user.externalId,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
        });
      }
      ctx.logger.debug({ userId: event.userId }, "example provider synced its directory");
    },
  };
}
