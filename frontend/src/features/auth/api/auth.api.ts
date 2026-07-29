import { apiRequest } from "@/lib/api-client";
import type { LoginCredentials, LoginResponse } from "@/features/auth/types/auth.types";
import type { UploadedFile } from "@/features/files/types/file.types";

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

/** Sube (o reemplaza) mi foto de perfil — se manda a EXTERNAL_AUTH y se cachea localmente. */
export function updateProfilePicture(token: string, image: Blob, filename = "avatar.png"): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", image, filename);
  return apiRequest<UploadedFile>("/v1/auth/profile/picture", { method: "PUT", token, body: form });
}

/** Borra mi foto de perfil (en EXTERNAL_AUTH y en la caché local) — vuelve a mostrar las iniciales. */
export function deleteProfilePicture(token: string): Promise<void> {
  return apiRequest<void>("/v1/auth/profile/picture", { method: "DELETE", token });
}
