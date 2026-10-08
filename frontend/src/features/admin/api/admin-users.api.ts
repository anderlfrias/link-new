import { apiRequest } from "@/lib/api-client";
import type {
  AdminAccountView,
  AdminUserListQuery,
  AdminUserListResponse,
  CreateAdminUserPayload,
  CreateAdminUserResponse,
  ResetPasswordResponse,
  UpdateAdminUserPayload,
} from "@/features/admin/types/admin-users.types";

const BASE_PATH = "/v1/admin/users";

export function listAdminUsers(token: string, query: AdminUserListQuery = {}): Promise<AdminUserListResponse> {
  return apiRequest<AdminUserListResponse>(BASE_PATH, {
    token,
    query: {
      before: query.before,
      limit: query.limit,
      search: query.search,
      status: query.status,
      hasPassword: query.hasPassword === undefined ? undefined : String(query.hasPassword),
    },
  });
}

/** Con cualquier proveedor. Si las cuentas las administra un proveedor externo, solo `status`
 * (activar o desactivar el acceso al chat). */
export function updateAdminUser(token: string, id: string, payload: UpdateAdminUserPayload): Promise<AdminAccountView> {
  return apiRequest<AdminAccountView>(`${BASE_PATH}/${id}`, { method: "PATCH", token, body: payload });
}

/** Solo modo local. */
export function createAdminUser(token: string, payload: CreateAdminUserPayload): Promise<CreateAdminUserResponse> {
  return apiRequest<CreateAdminUserResponse>(BASE_PATH, { method: "POST", token, body: payload });
}

/** Solo modo local: genera una contraseña temporal y deja el cambio obligatorio. */
export function resetAdminUserPassword(token: string, id: string): Promise<ResetPasswordResponse> {
  return apiRequest<ResetPasswordResponse>(`${BASE_PATH}/${id}/password-reset`, { method: "POST", token, body: {} });
}

/** Solo modo local: reinicia el contador de intentos fallidos. */
export function unlockAdminUser(token: string, id: string): Promise<void> {
  return apiRequest<void>(`${BASE_PATH}/${id}/unlock`, { method: "POST", token });
}
