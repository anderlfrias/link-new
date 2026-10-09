import { User, UserStatus } from "@prisma/client";
import {
  AuthenticateResult,
  AuthProvider,
  AuthProviderError,
  AuthProviderErrorReason,
  isAuthProviderError,
  ProviderContext,
} from "../../auth-providers/api";
import { createProviderContext } from "../../auth-providers/context";
import { getLogger } from "../../config/request-context";
import { filterKnownRoles } from "../../constants/roles.constant";
import { AppError, ForbiddenError, ServiceUnavailableError, UnauthorizedError } from "../../utils/errors";
import * as SettingsService from "../settings/settings.service";
import { upsertExternalUser } from "./auth.repository";
import { LoginUserResponse } from "./auth.types";
import { signSessionToken } from "./jwt";
import { buildLoginResponse } from "./login-response";

/// Tope de espera a `provider.authenticate`: un proveedor que no responde no puede
/// dejar colgado el inicio de sesión. Termina como `provider_unavailable`.
export const AUTHENTICATE_TIMEOUT_MS = 10_000;

const PROVIDER_UNAVAILABLE_MESSAGE =
  "No pudimos conectar con el servicio de autenticación. Intentá de nuevo en unos minutos.";

/// Qué le dice LINK a la persona según el motivo que informa el proveedor. El texto
/// es siempre el de LINK, no el del proveedor: la respuesta no depende de lo que
/// éste decida contar. `access_denied` es genérico a propósito: muchos proveedores
/// usan el mismo rechazo para credenciales incorrectas y para falta de acceso, así que
/// afirmar "no tenés acceso" puede ser mentira.
function loginErrorFor(reason: AuthProviderErrorReason): AppError {
  switch (reason) {
    case "invalid_credentials":
      return new UnauthorizedError("Usuario o contraseña incorrectos.");
    case "access_denied":
      return new ForbiddenError(
        "No pudimos verificar tus credenciales. Revisá tu usuario y contraseña. Si el problema persiste, contactá a un administrador.",
      );
    case "provider_unavailable":
      return new ServiceUnavailableError(PROVIDER_UNAVAILABLE_MESSAGE, "provider_unreachable");
    default:
      return new ServiceUnavailableError(PROVIDER_UNAVAILABLE_MESSAGE, "provider_error");
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthProviderError("provider_unavailable", "authenticate timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function authenticate(
  provider: AuthProvider,
  ctx: ProviderContext,
  input: { login: string; password: string; clientIp?: string },
): Promise<AuthenticateResult> {
  try {
    return await withTimeout(Promise.resolve(provider.authenticate(input, ctx)), AUTHENTICATE_TIMEOUT_MS);
  } catch (error) {
    if (isAuthProviderError(error)) {
      // El mensaje del proveedor es para diagnóstico: nunca llega a la persona.
      getLogger().debug(
        { provider: provider.id, reason: error.reason, detail: error.message },
        "auth provider rejected login",
      );
      throw loginErrorFor(error.reason);
    }
    // Cualquier otro error es un bug o una falla del proveedor, no una respuesta esperada.
    getLogger().error({ err: error, provider: provider.id }, "auth provider failed");
    throw loginErrorFor("provider_error");
  }
}

/// El proveedor es código de terceros: no se confía en que devuelva una identidad completa.
function assertValidIdentity(provider: AuthProvider, identity: AuthenticateResult): void {
  const valid =
    identity !== null &&
    typeof identity === "object" &&
    typeof identity.externalId === "string" &&
    identity.externalId !== "" &&
    typeof identity.email === "string" &&
    identity.email !== "" &&
    typeof identity.fullName === "string" &&
    Array.isArray(identity.roles);
  if (!valid) {
    getLogger().error({ provider: provider.id }, "auth provider returned an invalid identity");
    throw loginErrorFor("provider_error");
  }
}

/// Inicio de sesión con un proveedor externo. El proveedor solo valida las credenciales
/// y dice quién es la persona; el resto es de LINK, igual para cualquiera: guarda la
/// cuenta (con los roles que conoce), rechaza las desactivadas y emite su propia
/// sesión. El token del proveedor no sale de acá (ver docs/auth-providers.md).
///
/// Devuelve lo mismo que el login local (`loginWithLocalAccount`) para que el
/// controlador audite y responda sin distinguir. Los errores son los de `loginErrorFor`
/// y la cuenta desactivada: nunca el error crudo del proveedor.
export async function loginWithExternalProvider(
  provider: AuthProvider,
  login: string,
  password: string,
  clientIp?: string,
): Promise<{ record: User; response: { token: string; user: LoginUserResponse } }> {
  const ctx = createProviderContext(provider.id);
  const identity = await authenticate(provider, ctx, { login, password, clientIp });
  assertValidIdentity(provider, identity);

  const roles = filterKnownRoles(identity.roles.filter((role): role is string => typeof role === "string"));
  const record = await upsertExternalUser(
    provider.id,
    {
      externalId: identity.externalId,
      email: identity.email,
      // `undefined`: el proveedor no lo informa y se conserva el que ya había.
      username: identity.username === undefined ? undefined : identity.username?.trim() || null,
      fullName: identity.fullName,
    },
    { roles },
  );

  // Un admin puede cortarle el acceso al chat a una cuenta aunque el proveedor siga
  // aceptando su contraseña (LOCAL_AUTH_PLAN.md, D19). Se informa recién acá, con las
  // credenciales ya validadas.
  if (record.status !== UserStatus.ACTIVE) {
    throw new ForbiddenError(
      "Tu cuenta está desactivada en este chat. Si creés que es un error, contactá a un administrador.",
      "account_disabled",
    );
  }

  // LINK emite siempre su propia sesión: se verifica en cada request, el socket y las
  // descargas sin volver al proveedor, y la revocación y la duración de sesión
  // funcionan igual que en el modo local.
  const { sessionTtlHours } = await SettingsService.getLocalAuthPolicy();
  const token = signSessionToken(record, { ttlHours: sessionTtlHours, mustChangePassword: false });

  // En segundo plano: no debe retrasar ni romper el login si el proveedor está lento o
  // caído (avatar, directorio: lo que necesite credenciales que solo existen ahora).
  if (provider.onLogin) {
    const event = {
      userId: record.id,
      identity: {
        externalId: identity.externalId,
        email: identity.email,
        username: identity.username,
        fullName: identity.fullName,
        roles,
      },
      providerData: identity.providerData,
      syncProfileWithIntegration: record.syncProfileWithIntegration,
    };
    void Promise.resolve()
      .then(() => provider.onLogin!(event, ctx))
      .catch((error) => getLogger().error({ err: error, provider: provider.id }, "auth provider onLogin failed"));
  }

  return {
    record,
    response: buildLoginResponse(record, token, { authProvider: provider.id, mustChangePasswordReason: null }),
  };
}
