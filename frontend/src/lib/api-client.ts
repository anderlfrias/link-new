import { env } from "@/lib/env";
import { ApiError, type ApiErrorBody } from "@/types/api.types";

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Objeto para serializar como JSON, o FormData para multipart (subida de archivos). */
  body?: unknown;
  token?: string;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** "blob" para respuestas binarias (ej. la foto de perfil) — default "json". */
  responseType?: "json" | "blob";
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const url = new URL(`${env.apiUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, token, query, signal, responseType = "json" }: ApiRequestOptions = {},
): Promise<T> {
  const isFormData = body instanceof FormData;

  const response = await fetch(buildUrl(path, query), {
    method,
    signal,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(response.status, errorBody?.error ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  return (await response.json()) as T;
}
