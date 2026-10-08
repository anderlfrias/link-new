import { User } from "@prisma/client";
import jwt, { JwtPayload } from "jsonwebtoken";
import { LoginUserResponse, MustChangePasswordReason } from "./auth.types";

export function tokenExp(token: string): number {
  return (jwt.decode(token) as JwtPayload).exp ?? 0;
}

/// Cuerpo de `POST /auth/login`, igual para cualquier proveedor (API.md §1): la sesión de
/// LINK y la cuenta tal como está guardada. `authProvider` es el id del proveedor
/// que autenticó ("local" con cuentas propias).
export function buildLoginResponse(
  account: User,
  token: string,
  options: { authProvider: string; mustChangePasswordReason: MustChangePasswordReason | null },
): { token: string; user: LoginUserResponse } {
  return {
    token,
    user: {
      id: account.id,
      email: account.email,
      username: account.username,
      fullName: account.name,
      roles: account.roles,
      exp: tokenExp(token),
      authProvider: options.authProvider,
      internalUserId: account.id,
      mustChangePassword: options.mustChangePasswordReason !== null,
      mustChangePasswordReason: options.mustChangePasswordReason,
      notificationSoundEnabled: account.notificationSoundEnabled,
      language: account.language,
    },
  };
}
