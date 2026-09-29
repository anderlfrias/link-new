/** Ver backend/API.md, sección 2 (Autenticación). */

export interface LoginCredentials {
  user: string;
  password: string;
}

export interface AuthUser {
  /** Id externo en EXTERNAL_AUTH — NO usar para relacionar nada dentro del chat. */
  id: string;
  email: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  app: string;
  exp: number;
  /** Id interno (UUID de la tabla User local) — este es "mi id" para todo lo demás. */
  internalUserId: string;
  /** Preferencia 100% local — ver backend User.notificationSoundEnabled. */
  notificationSoundEnabled: boolean;
  /** Idioma preferido del usuario — ver backend User.language. */
  language?: "es" | "en";
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface Session {
  token: string;
  user: AuthUser;
}
