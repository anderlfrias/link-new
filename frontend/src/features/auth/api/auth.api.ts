import { apiRequest } from "@/lib/api-client";
import type {
  AuthConfig,
  ChangePasswordResponse,
  LoginCredentials,
  LoginResponse,
} from "@/features/auth/types/auth.types";
import type { UploadedFile } from "@/features/files/types/file.types";

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
}

/** Proveedor de autenticación, sus capacidades y, con cuentas locales, la política de contraseñas. Público. */
export function getAuthConfig(): Promise<AuthConfig> {
  return apiRequest<AuthConfig>("/v1/auth/config");
}

/** Cambia la propia contraseña (solo con cuentas locales). Acepta el token restringido
 * del cambio obligatorio. Los rechazos son 400 con `code`, nunca 401: una
 * contraseña actual incorrecta no cierra la sesión. */
export function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResponse> {
  return apiRequest<ChangePasswordResponse>("/v1/auth/password", {
    method: "PATCH",
    token,
    body: { currentPassword, newPassword },
  });
}

/** Mi foto de perfil ya cacheada localmente (redirige a /uploads/..., ver backend/API.md sección 2). */
export function getProfilePicture(token: string): Promise<Blob> {
  return apiRequest<Blob>("/v1/auth/profile/picture", { token, responseType: "blob" });
}

/** Sube (o reemplaza) mi foto de perfil — 100% local, nunca se relaciona con el proveedor externo de identidad. */
export function updateProfilePicture(token: string, image: Blob, filename = "avatar.png"): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", image, filename);
  return apiRequest<UploadedFile>("/v1/auth/profile/picture", { method: "PUT", token, body: form });
}

/** Borra mi foto de perfil (local, ver backend/API.md sección 2) — vuelve a mostrar las iniciales. */
export function deleteProfilePicture(token: string): Promise<void> {
  return apiRequest<void>("/v1/auth/profile/picture", { method: "DELETE", token });
}

/** Cambia mi propio nombre — 100% local, nunca se relaciona con el proveedor
 * externo de identidad (ver backend/API.md sección 2). */
export function updateProfile(token: string, name: string): Promise<{ name: string }> {
  return apiRequest<{ name: string }>("/v1/auth/profile", { method: "PATCH", token, body: { name } });
}

export interface UserPreferencesPayload {
  notificationSoundEnabled?: boolean;
  language?: "es" | "en";
}

export interface UserPreferencesResponse {
  notificationSoundEnabled: boolean;
  language?: "es" | "en";
}

/** Actualiza las preferencias del usuario (sonido, idioma) en backend. */
export function updateUserPreferences(
  token: string,
  preferences: UserPreferencesPayload,
): Promise<UserPreferencesResponse> {
  return apiRequest<UserPreferencesResponse>("/v1/auth/profile/preferences", {
    method: "PATCH",
    token,
    body: preferences,
  });
}

/** Activa/desactiva el tono de notificación de mensajes nuevos — preferencia
 * exclusiva mía, 100% local (no existe en el proveedor externo de identidad). */
export function updateNotificationSoundPreference(
  token: string,
  enabled: boolean,
): Promise<{ notificationSoundEnabled: boolean }> {
  return updateUserPreferences(token, { notificationSoundEnabled: enabled });
}
