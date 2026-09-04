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
import { storage } from "../../storage";
import {
  findAvatarPath,
  setLocalAvatar,
  setLocalName,
  setNotificationSoundEnabled,
  updateAvatarFileId,
  upsertUserFromExternalUser,
} from "./auth.repository";
import { MappedUser, ExternalUserLoginResponse } from "./auth.types";
import { buildFullName } from "./jwt";

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
    console.log(`EXTERNAL_AUTH login request returned status ${response.status}`);
    console.log(`EXTERNAL_AUTH login request body: ${await response.clone().text()}`);
  } catch {
    throw new ServiceUnavailableError("No pudimos conectar con el servicio de autenticación. Intentá de nuevo en unos minutos.");
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

  // EXTERNAL_AUTH devuelve 403 tanto para credenciales incorrectas como para falta de
  // acceso a esta app — no hay forma de distinguir el motivo real desde acá
  // (y tampoco confiamos en `data.error`: si EXTERNAL_AUTH no distingue el motivo,
  // su propio texto tampoco es confiable). Por eso el mensaje es genérico
  // a propósito, en vez de afirmar "no tenés acceso" cuando puede ser
  // simplemente un typo en la contraseña.
  if (response.status === 403 || /forbidden/i.test(data.error ?? "")) {
    throw new ForbiddenError(
      "No pudimos verificar tus credenciales. Revisá tu usuario y contraseña. Si el problema persiste, contactá a un administrador.",
    );
  }

  if (response.status === 401) {
    throw new UnauthorizedError(data.error ?? "Usuario o contraseña incorrectos.");
  }

  if (!response.ok) {
    throw new ServiceUnavailableError(
      "No pudimos conectar con el servicio de autenticación. Intentá de nuevo en unos minutos.",
    );
  }

  if (!data.success || !data.token) {
    throw new UnauthorizedError(data.error ?? "Usuario o contraseña incorrectos.");
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

/// Body compartido por `GET /v1/profile/picture` (propia) y
/// `GET /v1/profile/picture/:username` (de un tercero) — mismo formato de
/// respuesta y mismo mapeo de errores, solo cambia la URL/el identificador.
async function fetchExternalUserProfilePicture(url: string, token: string): Promise<ProfilePicture> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
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

/// GET /api/v1/profile/picture de EXTERNAL_AUTH identifica al usuario por el propio
/// token (no recibe ningún id) — por diseño de EXTERNAL_AUTH, esto solo puede traer
/// la foto de quien está autenticado, nunca la de otro usuario.
export function getProfilePicture(token: string): Promise<ProfilePicture> {
  return fetchExternalUserProfilePicture(`${env.EXTERNAL_AUTH_API_URL}/v1/profile/picture`, token);
}

/// GET /api/v1/profile/picture/:username de EXTERNAL_AUTH — a diferencia del endpoint
/// de arriba, este sí puede traer la foto de un tercero (identificado por
/// username, no por el dueño del token). Habilita cachear el avatar de
/// cualquier contacto de la app sin depender de que esa persona haya iniciado
/// sesión antes acá (ver `syncContactAvatar` y `user.service.ts`).
export function getProfilePictureByUsername(token: string, username: string): Promise<ProfilePicture> {
  return fetchExternalUserProfilePicture(
    `${env.EXTERNAL_AUTH_API_URL}/v1/profile/picture/${encodeURIComponent(username)}`,
    token,
  );
}

/// Guarda una foto ya obtenida (de EXTERNAL_AUTH, o de subirla nosotros mismos) como
/// `StoredFile` propio y apunta `User.avatarFileId` ahí — para que cualquier
/// otro usuario la vea sin depender de EXTERNAL_AUTH (que solo la sirve al dueño del
/// token, nunca a un tercero — ver README del módulo).
async function cacheAvatarLocally(userId: string, buffer: Buffer, contentType: string) {
  const stored = await FileService.storeAvatar(userId, buffer, contentType);
  await updateAvatarFileId(userId, stored.id);
  return stored;
}

/// Cuerpo compartido por `syncProfilePicture` (propia, vía token) y
/// `syncContactAvatar` (de un tercero, vía username): pide la foto con
/// `fetchPicture`, compara checksum contra la ya cacheada para no reescribir
/// un archivo si no cambió, y solo entonces cachea localmente. Nunca lanza —
/// ambos llamantes lo usan fire-and-forget.
async function syncAvatar(
  userId: string,
  currentAvatarFileId: string | null,
  fetchPicture: () => Promise<ProfilePicture>,
  logLabel: string,
): Promise<void> {
  try {
    let picture: ProfilePicture;
    try {
      picture = await fetchPicture();
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

    const stored = await cacheAvatarLocally(userId, picture.buffer, picture.contentType);
    console.log(`Profile picture cached for user ${userId} (file ${stored.id})`);
  } catch (error) {
    console.error(
      `Failed to sync profile picture (${logLabel}) for user ${userId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/// Cachea la foto de perfil del proveedor externo. Se llama en cada login
/// (fire-and-forget, nunca bloquea ni rompe el login): compara checksum
/// contra la ya guardada para no escribir un archivo nuevo si no cambió.
/// `enabled` es `User.syncProfileWithIntegration` — si ese usuario ya editó
/// su foto acá, esto ni siquiera pega contra el proveedor externo (respetar
/// su elección local es más importante que tener la foto "más fresca").
export function syncProfilePicture(
  userId: string,
  currentAvatarFileId: string | null,
  token: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return Promise.resolve();
  return syncAvatar(userId, currentAvatarFileId, () => getProfilePicture(token), "own");
}

/// Igual que `syncProfilePicture`, pero para la foto de un contacto que
/// todavía no inició sesión acá (ver `syncAppUsers`) — usa
/// `getProfilePictureByUsername` en vez de identificar por el propio token.
export function syncContactAvatar(
  userId: string,
  currentAvatarFileId: string | null,
  username: string,
  token: string,
): Promise<void> {
  return syncAvatar(
    userId,
    currentAvatarFileId,
    () => getProfilePictureByUsername(token, username),
    `contact:${username}`,
  );
}

/// Foto de perfil propia: 100% local a partir de acá — a diferencia de
/// `cacheAvatarLocally` (usada al sincronizar DESDE el proveedor externo),
/// esto NUNCA pega contra ningún proveedor externo y siempre apaga
/// `syncProfileWithIntegration` (`setLocalAvatar`, auth.repository.ts). Una
/// vez que el usuario elige su propia foto acá, esta base es la única fuente
/// de verdad para ella — el login deja de pisarla.
export async function setProfilePicture(userId: string, buffer: Buffer, contentType: string) {
  const stored = await FileService.storeAvatar(userId, buffer, contentType);
  await setLocalAvatar(userId, stored.id);
  return stored;
}

/// Quitar la propia foto (volver a mostrar iniciales) es, para este sistema,
/// una elección local tan explícita como subir una — también apaga
/// `syncProfileWithIntegration`, si no el próximo login traería de vuelta la
/// foto del proveedor externo pisando la decisión de sacarla.
export function removeProfilePicture(userId: string): Promise<User> {
  return setLocalAvatar(userId, null);
}

/// Cambiar el propio nombre: mismo criterio que la foto — 100% local, nunca
/// toca el proveedor externo, y apaga `syncProfileWithIntegration`.
export function updateOwnName(userId: string, name: string): Promise<User> {
  return setLocalName(userId, name);
}

/// Activar/desactivar el tono de notificación de mensajes nuevos — preferencia
/// exclusiva de este usuario, ver `notificationSoundEnabled` en schema.prisma.
export function updateNotificationSoundEnabled(userId: string, enabled: boolean): Promise<User> {
  return setNotificationSoundEnabled(userId, enabled);
}

/// URL pública (relativa, `/uploads/...`) de mi propia foto ya cacheada
/// localmente — ya no proxea al proveedor externo (ver README del módulo):
/// una vez que esta base tiene la foto (sincronizada en el login, o subida
/// acá), servirla es un `StoredFile` más, igual que la de cualquier otro
/// usuario. `404` si todavía no tengo ninguna.
export async function getOwnProfilePictureUrl(userId: string): Promise<string> {
  const path = await findAvatarPath(userId);
  if (!path) {
    throw new NotFoundError("Profile picture not found");
  }
  return storage.getPublicUrl(path);
}

export interface ExternalUserAppUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
}

/// GET /v1/apps/users/by-codes de EXTERNAL_AUTH: usuarios con acceso a una o más apps
/// (identificadas por código — acá siempre `APP_CODE_EXTERNAL_AUTH`). A diferencia de
/// `/v1/users` local (que solo lista a quien ya inició sesión en este chat
/// alguna vez), esto trae *todos* los usuarios autorizados para la app, hayan
/// entrado acá o no — es la fuente para poblar la lista de contactos completa
/// (ver `syncAppUsers`, usado por `user.service.ts`).
export async function getAppUsers(token: string): Promise<ExternalUserAppUser[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${env.EXTERNAL_AUTH_API_URL}/v1/apps/users/by-codes?codes=${encodeURIComponent(env.APP_CODE_EXTERNAL_AUTH)}`,
      { headers: { Authorization: token }, signal: controller.signal },
    );
  } catch (error) {
    console.error("EXTERNAL_AUTH app users request failed:", error instanceof Error ? error.message : error);
    throw new ServiceUnavailableError("User service unavailable");
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    console.error(`EXTERNAL_AUTH app users returned unexpected status ${response.status}`);
    throw new ServiceUnavailableError("User service unavailable");
  }

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : [];
  } catch {
    console.error("EXTERNAL_AUTH app users response is not valid JSON");
    throw new ServiceUnavailableError("User service unavailable");
  }

  const rawUsers = extractExternalUserArray(parsed);
  if (!rawUsers) {
    console.error("EXTERNAL_AUTH app users response has an unexpected shape");
    throw new ServiceUnavailableError("User service unavailable");
  }

  return rawUsers.map(mapExternalUserAppUser).filter((user): user is ExternalUserAppUser => user !== null);
}

/// EXTERNAL_AUTH puede devolver el array directo o envuelto (`{ data: [...] }` /
/// `{ users: [...] }`) — se acepta cualquiera de las tres formas sin
/// comprometerse a una en particular, ya que este endpoint no está documentado acá.
function extractExternalUserArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.users)) return obj.users;
  }
  return null;
}

/// Descarta (con log) cualquier entrada sin `id`/`email`/`username` en vez de
/// romper el sync completo por un solo registro raro.
function mapExternalUserAppUser(raw: unknown): ExternalUserAppUser | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const { id, email, username } = obj;
  if (typeof id !== "string" || typeof email !== "string" || typeof username !== "string") {
    console.error("Skipping malformed EXTERNAL_AUTH app user entry (missing id/email/username)");
    return null;
  }

  const fullName =
    typeof obj.fullName === "string" && obj.fullName
      ? obj.fullName
      : buildFullName({
          name: typeof obj.name === "string" ? obj.name : undefined,
          firstSurname: typeof obj.firstSurname === "string" ? obj.firstSurname : undefined,
          secondSurname: typeof obj.secondSurname === "string" ? obj.secondSurname : undefined,
        });

  return { id, email, username, fullName: fullName || username };
}

/// Trae todos los usuarios con acceso a esta app desde EXTERNAL_AUTH, los upsertea
/// localmente (para que aparezcan en el directorio y se pueda arrancar una
/// conversación con ellos aunque nunca hayan iniciado sesión acá — ver
/// `createConversation`, que exige que el miembro ya exista localmente), y
/// cachea la foto de los que todavía no tienen una. Nunca lanza: si EXTERNAL_AUTH no
/// responde, o algún usuario puntual falla, el directorio simplemente se
/// degrada a lo que ya había local (ver `user.service.ts`).
export async function syncAppUsers(token: string): Promise<void> {
  let appUsers: ExternalUserAppUser[];
  try {
    appUsers = await getAppUsers(token);
  } catch (error) {
    console.error(
      "Failed to sync app users from EXTERNAL_AUTH, falling back to local directory:",
      error instanceof Error ? error.message : error,
    );
    return;
  }

  await Promise.all(
    appUsers.map(async (appUser) => {
      try {
        const user = await upsertUserFromExternalUser(appUser);
        if (!user.avatarFileId && user.syncProfileWithIntegration) {
          await syncContactAvatar(user.id, user.avatarFileId, appUser.username, token);
        }
      } catch (error) {
        console.error(
          `Failed to sync contact ${appUser.username} from EXTERNAL_AUTH:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );
}

function parseExternalUserErrorCode(rawBody: string): string | undefined {
  try {
    return (JSON.parse(rawBody) as { code?: string }).code;
  } catch {
    return undefined;
  }
}
