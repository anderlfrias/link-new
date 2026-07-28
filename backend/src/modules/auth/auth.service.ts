import { createHash } from "crypto";
import { User } from "@prisma/client";
import env from "../../config/env";
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";
import * as FileService from "../files/file.service";
import { updateAvatarFileId, upsertUserFromExternalUser } from "./auth.repository";
import { MappedUser, ExternalUserLoginResponse } from "./auth.types";

/// Mismo timeout para toda llamada a EXTERNAL_AUTH (login, foto de perfil, lo que se agregue después).
const EXTERNAL_AUTH_REQUEST_TIMEOUT_MS = 5000;

export async function login(user: string, password: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.EXTERNAL_AUTH_API_URL}/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password, app: env.APP_CODE_EXTERNAL_AUTH }),
      signal: controller.signal,
    });
  } catch {
    throw new ServiceUnavailableError("User service unavailable");
  } finally {
    clearTimeout(timeout);
  }

  let data: Partial<ExternalUserLoginResponse> = {};
  try {
    const rawBody = await response.text();
    data = rawBody ? (JSON.parse(rawBody) as ExternalUserLoginResponse) : {};
  } catch {
    // EXTERNAL_AUTH no devolvió un body JSON válido; se resuelve más abajo según el status HTTP.
  }

  if (response.status === 403 || /forbidden/i.test(data.error ?? "")) {
    throw new ForbiddenError(data.error ?? "Forbidden");
  }

  if (response.status === 401) {
    throw new UnauthorizedError(data.error ?? "Invalid credentials");
  }

  if (!response.ok) {
    throw new ServiceUnavailableError("User service unavailable");
  }

  if (!data.success || !data.token) {
    throw new UnauthorizedError(data.error ?? "Invalid credentials");
  }

  return data.token;
}

export function upsertUsuario(mappedUser: MappedUser): Promise<User> {
  return upsertUserFromExternalUser(mappedUser);
}

export interface ProfilePicture {
  buffer: Buffer;
  contentType: string;
}

/// GET /api/v1/profile/picture de EXTERNAL_AUTH identifica al usuario por el propio
/// token (no recibe ningún id) — por diseño de EXTERNAL_AUTH, esto solo puede traer
/// la foto de quien está autenticado, nunca la de otro usuario.
export async function getProfilePicture(token: string): Promise<ProfilePicture> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.EXTERNAL_AUTH_API_URL}/v1/profile/picture`, {
      // EXTERNAL_AUTH decodifica el header tal cual con jwt-decode (sin esperar el
      // prefijo "Bearer "); mandarlo rompe el decode y EXTERNAL_AUTH cae a su catch (500).
      headers: { Authorization: token },
      signal: controller.signal,
    });
  } catch (error) {
    // Nunca loguear `token` acá — solo el motivo de la falla (timeout, DNS, TLS, etc.)
    console.error("EXTERNAL_AUTH profile picture request failed:", error instanceof Error ? error.message : error);
    throw new ServiceUnavailableError("User service unavailable");
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await response.text();

  if (!response.ok) {
    const code = parseExternalUserErrorCode(rawBody);
    if (code === "USER_NOT_FOUND" || code === "PROFILE_PICTURE_NOT_FOUND") {
      throw new NotFoundError("Profile picture not found");
    }
    console.error(
      `EXTERNAL_AUTH profile picture returned unexpected status ${response.status}${code ? ` (${code})` : ""}`,
    );
    throw new ServiceUnavailableError("User service unavailable");
  }

  // EXTERNAL_AUTH no devuelve bytes crudos: el body es el data URI completo
  // ("data:image/jpeg;base64,/9j/4AAQ..."), a veces envuelto en comillas de JSON.
  const dataUri = rawBody.startsWith('"') ? (JSON.parse(rawBody) as string) : rawBody;
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri.trim());
  if (!match) {
    console.error("EXTERNAL_AUTH profile picture response is not a data URI");
    throw new ServiceUnavailableError("User service unavailable");
  }

  const [, contentType, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), contentType };
}

/// Cachea la foto de perfil de EXTERNAL_AUTH como `StoredFile` propio, para que otros
/// usuarios puedan verla (EXTERNAL_AUTH solo la sirve al dueño del token, nunca a un
/// tercero — ver README del módulo). Se llama en cada login (fire-and-forget,
/// nunca bloquea ni rompe el login): compara checksum contra la ya guardada
/// para no escribir un archivo nuevo en cada login si la foto no cambió.
export async function syncProfilePicture(
  userId: string,
  currentAvatarFileId: string | null,
  token: string,
): Promise<void> {
  // Todo el cuerpo va en un único try/catch: es fire-and-forget (ver
  // auth.controller.ts), así que un throw acá se vuelve un unhandled
  // rejection si se escapa — nunca debe romper el proceso ni el login.
  try {
    let picture: ProfilePicture;
    try {
      picture = await getProfilePicture(token);
    } catch (error) {
      if (error instanceof NotFoundError) {
        if (currentAvatarFileId) {
          await updateAvatarFileId(userId, null);
        }
        return;
      }
      throw error;
    }

    const checksum = createHash("sha256").update(picture.buffer).digest("hex");
    const currentChecksum = currentAvatarFileId
      ? await FileService.getFileChecksum(currentAvatarFileId)
      : null;
    if (currentChecksum === checksum) return;

    const stored = await FileService.storeAvatar(userId, picture.buffer, picture.contentType);
    await updateAvatarFileId(userId, stored.id);
    console.log(`Profile picture cached for user ${userId} (file ${stored.id})`);
  } catch (error) {
    console.error(
      `Failed to sync profile picture from EXTERNAL_AUTH for user ${userId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

function parseExternalUserErrorCode(rawBody: string): string | undefined {
  try {
    return (JSON.parse(rawBody) as { code?: string }).code;
  } catch {
    return undefined;
  }
}
