import { createHash, randomUUID } from "crypto";
import env from "../../config/env";
import { getLogger } from "../../config/request-context";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { getWriteProvider, storage } from "../../storage";
import { BadRequestError, ForbiddenError, ServiceUnavailableError } from "../../utils/errors";
import * as SettingsService from "../settings/settings.service";
import { toStoredFileResponse } from "../files/file.service";
import * as FileRepository from "../files/file.repository";
import { StoredFileResponse } from "../files/file.types";
import { GetTrendingGiphyOptions, GiphyMediaKind, GiphySearchResult, SearchGiphyOptions } from "./giphy.types";

const GIPHY_API_BASE = "https://api.giphy.com/v1";
/// Mismo timeout que EXTERNAL_AUTH (ver auth.service.ts) — cualquier llamada a un
/// proveedor externo comparte el mismo criterio: no dejar el request colgado.
const GIPHY_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_SEARCH_LIMIT = 24;
const MAX_SEARCH_LIMIT = 50;

/// Sin key configurada, /v1/giphy/* responde 503 en vez de tirar abajo el
/// arranque del server entero (ver env.ts, GIPHY_API_KEY es opcional a
/// propósito, a diferencia de VAPID_*).
function assertGiphyConfigured(): string {
  if (!env.GIPHY_API_KEY) {
    throw new ServiceUnavailableError("GIFs and stickers are not configured on this server");
  }
  return env.GIPHY_API_KEY;
}

async function assertFeatureEnabled(): Promise<void> {
  const settings = await SettingsService.getSettings();
  if (!settings.allowStickersAndGifs) {
    throw new ForbiddenError("GIFs and stickers are disabled");
  }
}

/// Cualquier llamada a la API de Giphy pasa por acá — mismo patrón que
/// `fetchExternalUserProfilePicture` (auth.service.ts): AbortController con timeout,
/// nunca deja un request colgado, nunca expone la causa cruda del error.
async function fetchGiphy(path: string, params: Record<string, string | number>): Promise<unknown> {
  const apiKey = assertGiphyConfigured();
  const query = new URLSearchParams({ api_key: apiKey, ...toStringRecord(params) });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GIPHY_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${GIPHY_API_BASE}${path}?${query}`, { signal: controller.signal });
  } catch (error) {
    getLogger().warn({ err: error }, "giphy request failed");
    throw new ServiceUnavailableError("Could not reach Giphy");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Giphy responde JSON incluso en error, con `meta.msg` explicando el
    // motivo (ej. "Invalid authentication credentials" si la key no está
    // habilitada para este producto — Giphy separa GIFs/Stickers/Clips por
    // app en su dashboard, una key de una no sirve automáticamente para la
    // otra). Antes esto se tragaba silenciosamente en un "Could not reach
    // Giphy" genérico, indistinguible de un problema de red real.
    let detail = "";
    try {
      const body = (await response.clone().json()) as { meta?: { msg?: string } };
      if (body.meta?.msg) detail = ` — ${body.meta.msg}`;
    } catch {
      // el body no era JSON parseable; seguimos solo con el status
    }
    getLogger().warn({ path, status: response.status, detail: detail || undefined }, "giphy request returned non-ok status");
    throw new ServiceUnavailableError(`Giphy returned HTTP ${response.status}${detail}`);
  }

  return response.json();
}

function toStringRecord(params: Record<string, string | number>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]));
}

/// Recorta el objeto crudo de Giphy (decenas de renditions/metadata) a lo
/// único que el picker necesita — `images.fixed_width` es la rendition
/// animada liviana estándar que Giphy recomienda para grillas de resultados;
/// `images.original` es la rendition de calidad completa, devuelta también
/// para que `POST /import` la descargue directo sin tener que volver a
/// pedirle el objeto a Giphy por id (ver `importGiphyAsset` — ese "volver a
/// resolver por id" no existe para stickers en la API de Giphy).
function toSearchResult(raw: unknown): GiphySearchResult | null {
  const obj = raw as {
    id?: string;
    title?: string;
    images?: {
      fixed_width?: { url?: string; width?: string; height?: string };
      original?: { url?: string };
    };
  };
  const preview = obj.images?.fixed_width;
  const original = obj.images?.original;
  if (!obj.id || !preview?.url || !original?.url) return null;

  return {
    id: obj.id,
    title: obj.title ?? "",
    previewUrl: preview.url,
    originalUrl: original.url,
    width: Number(preview.width) || 0,
    height: Number(preview.height) || 0,
  };
}

/// Hosts reales de los que Giphy sirve contenido (`media0-4.giphy.com`,
/// `i.giphy.com`, etc. — todos terminan en `.giphy.com`, o son exactamente
/// `giphy.com`). `importGiphyAsset` revalida esto SIEMPRE antes de descargar,
/// aunque `originalUrl` venga de un resultado que este mismo servidor ya le
/// pidió a Giphy segundos antes — es la única barrera real contra SSRF ahora
/// que no hay un "resolver por id" que vuelva a confirmarlo contra Giphy.
function isGiphyCdnUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && /(^|\.)giphy\.com$/i.test(parsed.hostname);
}

/// Las URLs de medios de Giphy pueden redirigir (ej. entre sus CDNs). Se
/// siguen a mano, revalidando cada salto con `isGiphyCdnUrl`: con el
/// `redirect: "follow"` por defecto de fetch, un redirect hacia cualquier host
/// (incluida una IP interna) se seguía sin pasar por esa validación.
const MAX_GIPHY_REDIRECTS = 3;

async function fetchGiphyAsset(url: string, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; ; hop++) {
    const response = await fetch(current, { signal, redirect: "manual" });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return response;
    if (hop >= MAX_GIPHY_REDIRECTS) {
      throw new Error("too many redirects downloading a Giphy asset");
    }
    const next = new URL(location, current).toString();
    if (!isGiphyCdnUrl(next)) {
      throw new Error("Giphy asset redirected outside giphy.com");
    }
    current = next;
  }
}

export async function searchGiphy(
  kind: GiphyMediaKind,
  query: string,
  options: SearchGiphyOptions = {},
): Promise<GiphySearchResult[]> {
  await assertFeatureEnabled();
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const data = (await fetchGiphy(`/${kind}/search`, {
    q: query,
    limit,
    offset: options.offset ?? 0,
    rating: "g",
  })) as { data?: unknown[] };
  return (data.data ?? []).map(toSearchResult).filter((result): result is GiphySearchResult => result !== null);
}

export async function getTrendingGiphy(
  kind: GiphyMediaKind,
  options: GetTrendingGiphyOptions = {},
): Promise<GiphySearchResult[]> {
  await assertFeatureEnabled();
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const data = (await fetchGiphy(`/${kind}/trending`, { limit, rating: "g" })) as { data?: unknown[] };
  return (data.data ?? []).map(toSearchResult).filter((result): result is GiphySearchResult => result !== null);
}

/// A diferencia de `uploadFile`/`storeAvatar`, el contenido nunca llega en el
/// body del request: `originalUrl` viene del propio `searchGiphy`/
/// `getTrendingGiphy` (este mismo servidor ya se la pidió a Giphy segundos
/// antes, ver `toSearchResult`), no de un campo libre que el cliente pueda
/// inventar — y aun así se revalida acá con `isGiphyCdnUrl` (host real de
/// Giphy, `https`) antes de descargar, para no depender ciegamente de que el
/// cliente no la haya alterado. Antes esto se resolvía volviendo a pedirle
/// el objeto a Giphy por `giphyId`, pero la API de Giphy no tiene un "get by
/// id" para stickers (`/v1/stickers/{id}` no existe, y `/v1/gifs/{id}`
/// tampoco resuelve confiablemente un id de sticker) — de ahí el cambio.
/// Guardar como `StoredFile` propio (en vez de solo linkear la URL de Giphy)
/// reutiliza todo el pipeline existente de mensajes (MessageFile, borrado
/// lógico, panel de admin de storage, retención) y no depende de que ese
/// link de Giphy siga vivo/estable después.
export async function importGiphyAsset(
  currentUserId: string,
  kind: GiphyMediaKind,
  giphyId: string,
  originalUrl: string,
): Promise<StoredFileResponse> {
  await assertFeatureEnabled();
  const settings = await SettingsService.getSettings();

  if (!isGiphyCdnUrl(originalUrl)) {
    throw new BadRequestError("originalUrl must be an https URL on a giphy.com host");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GIPHY_REQUEST_TIMEOUT_MS);
  let downloadResponse: Response;
  try {
    downloadResponse = await fetchGiphyAsset(originalUrl, controller.signal);
  } catch (error) {
    getLogger().warn({ err: error }, "giphy asset download failed");
    throw new ServiceUnavailableError("Could not download the selected Giphy asset");
  } finally {
    clearTimeout(timeout);
  }

  if (!downloadResponse.ok) {
    throw new ServiceUnavailableError("Could not download the selected Giphy asset");
  }

  const mimeType = downloadResponse.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!mimeType.startsWith("image/")) {
    throw new BadRequestError("Unexpected Giphy asset content type");
  }

  // Si el tamaño declarado ya supera el límite, se corta antes de leer el
  // body: leerlo entero primero dejaba que cualquier respuesta grande ocupara
  // memoria antes del chequeo de abajo (que sigue haciendo falta: el
  // Content-Length puede no venir).
  const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;
  if (Number(downloadResponse.headers.get("content-length")) > maxBytes) {
    controller.abort();
    throw new BadRequestError(`File exceeds the maximum allowed size of ${settings.maxUploadSizeMb}MB`);
  }

  const buffer = Buffer.from(await downloadResponse.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new BadRequestError(`File exceeds the maximum allowed size of ${settings.maxUploadSizeMb}MB`);
  }

  const subtype = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const extension = ALLOWED_MIME_TYPES[mimeType]?.extension ?? subtype ?? "bin";
  const storedName = `${randomUUID()}.${extension}`;
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const now = new Date();
  const relativeDir = `giphy/${kind}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { provider, storage: writeStorage } = getWriteProvider();
  const saved = await writeStorage.save(buffer, `${relativeDir}/${storedName}`);
  const file = await FileRepository.createStoredFile({
    originalName: `${kind === "stickers" ? "sticker" : "gif"}-${giphyId}.${extension}`,
    storedName,
    path: saved.path,
    mimeType,
    extension,
    size: BigInt(saved.size),
    checksum,
    createdById: currentUserId,
    provider,
  });

  return toStoredFileResponse(file, currentUserId);
}
