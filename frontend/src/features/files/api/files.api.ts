import { apiRequest } from "@/lib/api-client";
import type { UploadedFile } from "@/features/files/types/file.types";

const BASE_PATH = "/v1/files";

/** `conversationId` es solo para que el backend organice el archivo bajo esa conversación en disco. */
export function uploadFile(token: string, file: File, conversationId?: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  if (conversationId) form.append("conversationId", conversationId);
  return apiRequest<UploadedFile>(BASE_PATH, { method: "POST", token, body: form });
}

export function getFile(token: string, fileId: string): Promise<UploadedFile> {
  return apiRequest<UploadedFile>(`${BASE_PATH}/${fileId}`, { token });
}

export function deleteFile(token: string, fileId: string): Promise<{ id: string }> {
  return apiRequest(`${BASE_PATH}/${fileId}`, { method: "DELETE", token });
}
