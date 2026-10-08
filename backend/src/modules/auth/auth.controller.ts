import { NextFunction, Request, Response } from "express";
import { AuditAction } from "@prisma/client";
import { currentProviderId, getAuthProvider } from "../../auth-providers/registry";
import { getClientIp } from "../../config/client-ip";
import {
  BadRequestError,
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";
import * as AuditService from "../audit/audit.service";
import { LoginFailureReason } from "../audit/audit.types";
import * as AuthService from "./auth.service";
import { LocalLoginError } from "./auth.errors";
import * as ExternalLoginService from "./external-login.service";
import * as LocalAuthService from "./local-auth.service";

export function mapLoginFailureReason(error: unknown): LoginFailureReason {
  // El login local ya sabe el motivo real (D12): la respuesta HTTP es la misma
  // para varios, la auditoría no.
  if (error instanceof LocalLoginError) {
    return error.reason;
  }
  if (error instanceof ForbiddenError) {
    return error.code === "account_disabled" ? "account_disabled" : "forbidden_by_provider";
  }
  if (error instanceof UnauthorizedError) {
    return "invalid_credentials";
  }
  if (error instanceof ServiceUnavailableError) {
    if (error.code === "provider_unreachable") {
      return "provider_unreachable";
    }
    return "provider_error";
  }
  return "provider_error";
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, password } = req.body as { user?: string; password?: string };
    if (!user || !password) {
      throw new BadRequestError("Ingresá tu usuario y tu contraseña.");
    }

    // Con un proveedor externo, el login lo valida el proveedor y LINK emite igual su
    // propia sesión (ver external-login.service.ts); si no, cuentas locales. En los dos
    // casos el resultado es el mismo: la cuenta y la respuesta.
    // Misma regla de IP que el rate limiting y la auditoría (config/client-ip.ts):
    // CF-Connecting-IP solo cuenta si la instalación declara que está detrás de
    // Cloudflare. Esta IP es la que el proveedor puede usar para sus propios bloqueos.
    const provider = getAuthProvider();
    const { record, response } = provider
      ? await ExternalLoginService.loginWithExternalProvider(provider, user, password, getClientIp(req))
      : await LocalAuthService.loginWithLocalAccount(user, password);

    void AuditService.record({
      action: AuditAction.LOGIN,
      userId: record.id,
      actorEmail: record.email,
      metadata: { provider: currentProviderId() },
    });
    res.json(response);
  } catch (error) {
    // El intento fallido se registra con la identidad INTENTADA y sin userId:
    // puede no existir ningún User local para ese usuario (ver el comentario de
    // `userId` en el schema). `record` nunca tira, así que esto no puede
    // enmascarar el error original que se propaga abajo.
    // BadRequestError (falta de user/password) no es un intento de autenticación y no se audita.
    if (!(error instanceof BadRequestError)) {
      void AuditService.record({
        action: AuditAction.LOGIN_FAILED,
        userId: null,
        actorEmail: typeof req.body?.user === "string" ? req.body.user : null,
        metadata: { provider: currentProviderId(), reason: mapLoginFailureReason(error) },
      });
    }
    next(error);
  }
}

export async function getProfilePicture(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.internalUserId!;
    const url = await AuthService.getOwnProfilePictureUrl(userId);
    res.redirect(url);
  } catch (error) {
    next(error);
  }
}

export async function updateProfilePicture(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new BadRequestError('Missing image (expected multipart/form-data field "file")');
    }
    const userId = req.user!.internalUserId!;
    const stored = await AuthService.setProfilePicture(userId, req.file.buffer, req.file.mimetype);
    res.json(stored);
  } catch (error) {
    next(error);
  }
}

export async function deleteProfilePicture(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.internalUserId!;
    await AuthService.removeProfilePicture(userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.body as { name: string };
    const userId = req.user!.internalUserId!;
    const updated = await AuthService.updateOwnName(userId, name);
    res.json({ name: updated.name });
  } catch (error) {
    next(error);
  }
}

export async function updatePreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const { notificationSoundEnabled, language } = req.body as {
      notificationSoundEnabled?: boolean;
      language?: string;
    };
    const userId = req.user!.internalUserId!;
    const updated = await AuthService.updatePreferences(userId, {
      ...(notificationSoundEnabled !== undefined && { notificationSoundEnabled }),
      ...(language !== undefined && { language }),
    });
    res.json({
      notificationSoundEnabled: updated.notificationSoundEnabled,
      language: updated.language,
    });
  } catch (error) {
    next(error);
  }
}

/// `GET /auth/config`: público, sin token (LOCAL_AUTH_PLAN.md, D14).
export async function getAuthConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await LocalAuthService.getPublicAuthConfig());
  } catch (error) {
    next(error);
  }
}

/// `PATCH /auth/password` (solo modo local): el token nuevo reemplaza al actual.
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const userId = req.user!.internalUserId!;
    res.json(await LocalAuthService.changeOwnPassword(userId, currentPassword, newPassword));
  } catch (error) {
    next(error);
  }
}
