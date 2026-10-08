// Contrato público de los proveedores de autenticación externos de LINK.
//
// Este archivo es AUTOCONTENIDO a propósito: no importa nada. Un proveedor
// que vive en otro repositorio lo copia tal cual en cada actualización de LINK
// (no hay paquete npm que publicar), y `AUTH_PROVIDER_API_VERSION` hace que un
// desfase falle al arrancar en vez de en silencio. Hay un test que verifica que
// siga sin importar nada (`api.test.ts`).
//
// El proveedor solo interviene al iniciar sesión: valida las credenciales y dice
// quién es la persona. Todo lo demás (la sesión, la revocación, los roles, la
// desactivación de cuentas, la auditoría) es del core de LINK y es igual para
// cualquier proveedor. Detalle en `docs/auth-providers.md`.

/// Versión de la interfaz. Sube solo con cambios incompatibles: agregar campos
/// opcionales o operaciones nuevas a `ProviderContext` NO la cambia; quitar o
/// cambiar algo, sí. Si un proveedor declara otra versión, el backend no arranca.
export const AUTH_PROVIDER_API_VERSION = 1;

export interface AuthProvider {
  /// Identificador estable: se guarda en `User.identityProvider` y en la
  /// auditoría. Cambiarlo desvincula a los usuarios ya sincronizados.
  id: string;
  /// Nombre visible en la interfaz ("Sincronizado con {displayName}").
  displayName: string;
  apiVersion: number;
  /// Valida la configuración propia del proveedor (variables de entorno, etc.).
  /// Si lanza, el backend no arranca.
  init?(ctx: ProviderContext): Promise<void> | void;
  /// Valida las credenciales y devuelve la identidad externa. Los errores
  /// esperados son `AuthProviderError`; cualquier otro se trata como
  /// `provider_error`.
  authenticate(input: CredentialsInput, ctx: ProviderContext): Promise<AuthenticateResult>;
  /// Opcional. Corre después de que LINK creó la sesión, en segundo plano: un
  /// error se loguea y no afecta al inicio de sesión. Sirve para sincronizar el
  /// avatar o el directorio con credenciales que solo existen en este momento.
  onLogin?(event: LoginEvent, ctx: ProviderContext): Promise<void>;
}

export interface CredentialsInput {
  /// Usuario o correo, tal como lo escribió la persona.
  login: string;
  password: string;
  /// IP del cliente, ya resuelta por el core según `TRUST_PROXY`.
  clientIp?: string;
}

/// Una persona del directorio del proveedor.
export interface DirectoryUser {
  /// Identificador de la persona en el proveedor. Único en toda la instalación.
  externalId: string;
  email: string;
  username?: string | null;
  fullName: string;
}

export interface ExternalIdentity extends DirectoryUser {
  /// El core se queda solo con los roles que conoce (hoy, "admin").
  roles: string[];
}

export type AuthenticateResult = ExternalIdentity & {
  /// Lo que el proveedor quiera pasarse de `authenticate()` a `onLogin()` (por
  /// ejemplo, el token del proveedor). El core no lo mira.
  providerData?: unknown;
};

export interface LoginEvent {
  /// Id interno de LINK.
  userId: string;
  identity: ExternalIdentity;
  providerData?: unknown;
  /// `false` si la persona ya cambió su nombre o su foto en LINK: el avatar del
  /// proveedor no se va a guardar, así que no hace falta pedirlo.
  syncProfileWithIntegration: boolean;
}

export type AuthProviderErrorReason =
  /// Usuario o contraseña incorrectos. HTTP 401.
  | "invalid_credentials"
  /// El proveedor rechazó a la persona (por ejemplo, sin acceso a esta aplicación). HTTP 403.
  | "access_denied"
  /// El proveedor no responde (caído, timeout). HTTP 503.
  | "provider_unavailable"
  /// El proveedor respondió algo inesperado. HTTP 503.
  | "provider_error";

export class AuthProviderError extends Error {
  constructor(
    public readonly reason: AuthProviderErrorReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "AuthProviderError";
  }
}

const REASONS: readonly string[] = ["invalid_credentials", "access_denied", "provider_unavailable", "provider_error"];

/// Un proveedor cargado desde otro repositorio trae su propia copia de este
/// archivo, así que `instanceof AuthProviderError` no sirve entre las dos: se
/// reconoce por el nombre y el motivo.
export function isAuthProviderError(error: unknown): error is AuthProviderError {
  if (error instanceof AuthProviderError) return true;
  if (!(error instanceof Error)) return false;
  const { name, reason } = error as Error & { reason?: unknown };
  return name === "AuthProviderError" && typeof reason === "string" && REASONS.includes(reason);
}

export interface ProviderLogger {
  debug(fields: object, message?: string): void;
  info(fields: object, message?: string): void;
  warn(fields: object, message?: string): void;
  error(fields: object, message?: string): void;
}

/// Lo único del core que ve el proveedor. Es chico a propósito: ampliarlo es un
/// cambio compatible, quitar algo no lo es.
export interface ProviderContext {
  /// Nunca loguear contraseñas ni tokens.
  logger: ProviderLogger;
  users: {
    /// Crea o actualiza una persona del directorio, con las reglas de LINK: se
    /// la reconoce por `externalId`, si no por correo; el nombre solo se
    /// actualiza mientras la persona no lo haya editado en LINK; el estado
    /// (activa o desactivada) y los roles no se tocan.
    upsertExternalUser(user: DirectoryUser): Promise<{ userId: string }>;
    /// Guarda el avatar de una persona si cambió, salvo que ella lo haya editado
    /// en LINK. `null` lo quita (el proveedor ya no tiene foto).
    setAvatarFromProvider(userId: string, image: { data: Buffer; mimeType: string } | null): Promise<void>;
    /// Personas de este proveedor que todavía no tienen avatar y cuyo perfil se
    /// sincroniza: para no pedirle al proveedor las fotos de todo el directorio.
    listWithoutAvatar(): Promise<Array<{ userId: string; username: string | null; externalId: string | null }>>;
  };
}
