import { User } from "@prisma/client";
import env from "../../config/env";
import { ForbiddenError, ServiceUnavailableError, UnauthorizedError } from "../../utils/errors";
import { upsertUserFromExternalUser } from "./auth.repository";
import { MappedUser, ExternalUserLoginResponse } from "./auth.types";

const EXTERNAL_AUTH_LOGIN_TIMEOUT_MS = 5000;

export async function login(user: string, password: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_AUTH_LOGIN_TIMEOUT_MS);

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
