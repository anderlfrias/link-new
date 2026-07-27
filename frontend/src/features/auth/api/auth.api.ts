import { apiRequest } from "@/lib/api-client";
import type { LoginCredentials, LoginResponse } from "@/features/auth/types/auth.types";

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
}

/** Proxea GET /api/v1/profile/picture de EXTERNAL_AUTH — solo puede traer la foto de quien es dueño del token. */
export function getProfilePicture(token: string): Promise<Blob> {
  return apiRequest<Blob>("/v1/auth/profile/picture", { token, responseType: "blob" });
}
