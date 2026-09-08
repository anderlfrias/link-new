import { apiRequest } from "@/lib/api-client";
import type { UploadedFile } from "@/features/files/types/file.types";
import type { GiphyMediaKind, GiphySearchResult } from "@/features/giphy/types/giphy.types";

const BASE_PATH = "/v1/giphy";

export function searchGiphy(
  token: string,
  kind: GiphyMediaKind,
  q: string,
  options: { limit?: number; offset?: number } = {},
): Promise<GiphySearchResult[]> {
  return apiRequest<GiphySearchResult[]>(`${BASE_PATH}/search`, {
    token,
    query: { kind, q, limit: options.limit, offset: options.offset },
  });
}

export function getTrendingGiphy(
  token: string,
  kind: GiphyMediaKind,
  options: { limit?: number } = {},
): Promise<GiphySearchResult[]> {
  return apiRequest<GiphySearchResult[]>(`${BASE_PATH}/trending`, { token, query: { kind, limit: options.limit } });
}

/** Devuelve la misma forma que `uploadFile` (`../files/api/files.api.ts`) —
 * el resto del composer lo trata igual sea cual sea el origen del archivo.
 * `originalUrl` sale del mismo resultado de `searchGiphy`/`getTrendingGiphy`
 * elegido — el backend la revalida antes de descargar. */
export function importGiphyAsset(
  token: string,
  kind: GiphyMediaKind,
  giphyId: string,
  originalUrl: string,
): Promise<UploadedFile> {
  return apiRequest<UploadedFile>(`${BASE_PATH}/import`, { method: "POST", token, body: { kind, giphyId, originalUrl } });
}
