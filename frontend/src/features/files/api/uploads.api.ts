import { apiRequest } from "@/lib/api-client";
import type { UploadedFile } from "@/features/files/types/file.types";
import type {
  CompleteUploadInput,
  InitiateUploadInput,
  InitiateUploadResponse,
  PartUrlItem,
  UploadStatusResponse,
} from "@/features/files/types/upload.types";

const BASE_PATH = "/v1/uploads";

/** Inicia una sesión de subida multipart en el backend. */
export function initiateUpload(token: string, input: InitiateUploadInput): Promise<InitiateUploadResponse> {
  return apiRequest<InitiateUploadResponse>(BASE_PATH, {
    method: "POST",
    token,
    body: input,
  });
}

/** Obtiene el estado actual de la sesión y las partes registradas en el storage. */
export function getUploadStatus(token: string, uploadId: string): Promise<UploadStatusResponse> {
  return apiRequest<UploadStatusResponse>(`${BASE_PATH}/${uploadId}`, {
    method: "GET",
    token,
  });
}

/** Solicita URLs presignadas PUT para un lote de números de parte (máximo 20 por llamada). */
export function getPartUrls(
  token: string,
  uploadId: string,
  partNumbers: number[],
): Promise<PartUrlItem[]> {
  return apiRequest<PartUrlItem[]>(`${BASE_PATH}/${uploadId}/part-urls`, {
    method: "POST",
    token,
    body: { partNumbers },
  });
}

/** Completa la subida multipart, verificando el tamaño real con HeadObject y creando el StoredFile. */
export function completeUpload(
  token: string,
  uploadId: string,
  input?: CompleteUploadInput,
): Promise<UploadedFile> {
  return apiRequest<UploadedFile>(`${BASE_PATH}/${uploadId}/complete`, {
    method: "POST",
    token,
    body: input ?? {},
  });
}

/** Cancela la sesión en curso y aborta el multipart upload en el storage S3. */
export function abortUpload(
  token: string,
  uploadId: string,
): Promise<{ id: string; status: string }> {
  return apiRequest<{ id: string; status: string }>(`${BASE_PATH}/${uploadId}`, {
    method: "DELETE",
    token,
  });
}
