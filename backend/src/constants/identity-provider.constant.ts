/// Proveedores de identidad externa soportados. Se guarda en
/// `User.identityProvider` para saber qué sistema sincronizó por
/// última vez un perfil de usuario.
export const IDENTITY_PROVIDER = {
  EXTERNAL_AUTH: "external-auth",
} as const;

export type IdentityProvider = (typeof IDENTITY_PROVIDER)[keyof typeof IDENTITY_PROVIDER];
