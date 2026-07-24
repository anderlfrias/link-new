import { apiRequest } from "@/lib/api-client";
import type { UploadedFile } from "@/features/files/types/file.types";

const BASE_PATH = "/v1/files";

export function uploadFile(token: string, file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<UploadedFile>(BASE_PATH, { method: "POST", token, body: form });
}

export function getFile(token: string, fileId: string): Promise<UploadedFile> {
  return apiRequest<UploadedFile>(`${BASE_PATH}/${fileId}`, { token });
}

export function deleteFile(token: string, fileId: string): Promise<{ id: string }> {
  return apiRequest(`${BASE_PATH}/${fileId}`, { method: "DELETE", token });
}
