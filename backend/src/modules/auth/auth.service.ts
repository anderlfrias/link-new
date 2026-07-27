import { User } from "@prisma/client";
import env from "../../config/env";
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";
import { upsertUserFromExternalUser } from "./auth.repository";
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
      headers: { Authorization: `${token}` },
      signal: controller.signal,
    });
  } catch {
    throw new ServiceUnavailableError("User service unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) {
    throw new UnauthorizedError("Invalid or expired token");
  }
  if (response.status === 404) {
    throw new NotFoundError("Profile picture not found");
  }
  if (!response.ok) {
    throw new ServiceUnavailableError("User service unavailable");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}
