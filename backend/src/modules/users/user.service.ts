import * as AuthService from "../auth/auth.service";
import * as UserRepository from "./user.repository";

/// Antes de leer el directorio local, sincroniza los usuarios de EXTERNAL_AUTH con
/// acceso a esta app (`AuthService.syncAppUsers`) — así el directorio incluye
/// a cualquiera con acceso, no solo a quien ya inició sesión en este chat
/// alguna vez. Si EXTERNAL_AUTH no responde, `syncAppUsers` nunca lanza: el
/// directorio simplemente se sirve con lo que ya había local.
export async function listUsers(currentUserId: string, token: string, search?: string) {
  await AuthService.syncAppUsers(token);
  return UserRepository.search(currentUserId, search);
}
