import { NextFunction, Request, Response } from "express";
import { AuditAction, UserStatus } from "@prisma/client";
import jwt, { JwtPayload } from "jsonwebtoken";
import { getClientIp } from "../../config/client-ip";
import env from "../../config/env";
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
import * as LocalAuthService from "./local-auth.service";
import { filterKnownRoles } from "../../constants/roles.constant";
import * as SettingsService from "../settings/settings.service";
import { mapTokenToUser, signSessionToken, verifyToken } from "./jwt";

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

function sessionTokenExp(token: string): number {
  return (jwt.decode(token) as JwtPayload).exp ?? 0;
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, password } = req.body as { user?: string; password?: string };
    if (!user || !password) {
      throw new BadRequestError("Ingresá tu usuario y tu contraseña.");
    }

    if (env.auth.mode === "local") {
      const { record, response } = await LocalAuthService.loginWithLocalAccount(user, password);
      void AuditService.record({
        action: AuditAction.LOGIN,
        userId: record.id,
        actorEmail: record.email,
        metadata: { provider: "local" },
      });
      res.json(response);
      return;
    }

    // Misma regla de IP que el rate limiting y la auditoría (config/client-ip.ts):
    // CF-Connecting-IP solo cuenta si la instalación declara que está detrás
    // de Cloudflare. Esta IP es la que EXTERNAL_AUTH usa para sus propios bloqueos.
    // Este es el token de EXTERNAL_AUTH: sirve solo para este login (verificarlo, y pedirle a
    // EXTERNAL_AUTH la foto y el directorio). La sesión de LINK es otro token, más abajo.
    const providerToken = await AuthService.login(user, password, getClientIp(req));
    const mappedUser = mapTokenToUser(verifyToken(providerToken));
    // Los roles de EXTERNAL_AUTH se guardan en la cuenta en cada login (solo los que la app
    // conoce): a partir de acá se leen de la base, igual que en el modo local.
    const internalUser = await AuthService.upsertUsuario(mappedUser, filterKnownRoles(mappedUser.roles));
    // Un admin puede cortarle el acceso al chat a una cuenta aunque EXTERNAL_AUTH
    // siga aceptando su contraseña (LOCAL_AUTH_PLAN.md, D19). Se informa
    // recién acá, con las credenciales ya validadas por EXTERNAL_AUTH.
    if (internalUser.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError(
        "Tu cuenta está desactivada en este chat. Si creés que es un error, contactá a un administrador.",
        "account_disabled",
      );
    }

    void AuditService.record({
      action: AuditAction.LOGIN,
      userId: internalUser.id,
      actorEmail: mappedUser.email,
      metadata: { provider: env.auth.mode },
    });

    // LINK emite siempre su propia sesión: se verifica en cada request, el socket y las
    // descargas sin volver a EXTERNAL_AUTH, y la revocación y la duración de sesión funcionan
    // igual que en el modo local (AUTH_PROVIDERS_PLAN, decisión 1).
    const { sessionTtlHours } = await SettingsService.getLocalAuthPolicy();
    const sessionToken = signSessionToken(internalUser, { ttlHours: sessionTtlHours, mustChangePassword: false });

    res.json({
      token: sessionToken,
      // `fullName` sale de `internalUser.name` (esta base), no de `mappedUser`
      // (el JWT del proveedor externo tal cual): si este usuario ya cambió su
      // nombre acá, `upsertUsuario` no lo pisó (ver auth.repository.ts), pero
      // el JWT externo sigue teniendo el nombre viejo — mandar `mappedUser.fullName`
      // acá mostraría ese nombre viejo en el propio cliente aunque la base ya
      // tenga el correcto.
      user: {
        ...mappedUser,
        // La sesión es la de LINK: vence cuando vence su token, no el de EXTERNAL_AUTH.
        exp: sessionTokenExp(sessionToken),
        roles: internalUser.roles,
        fullName: internalUser.name,
        internalUserId: internalUser.id,
        notificationSoundEnabled: internalUser.notificationSoundEnabled,
        language: internalUser.language,
        // En modo external-auth la contraseña la administra EXTERNAL_AUTH: nunca hay cambio
        // obligatorio de este lado (LOCAL_AUTH_PLAN.md §7).
        mustChangePassword: false,
        mustChangePasswordReason: null,
      },
    });

    // Fire-and-forget: no debe retrasar ni romper el login si el proveedor
    // externo está lento o caído (syncProfilePicture nunca lanza — ver
    // auth.service.ts). No hace nada si este usuario ya desactivó la
    // sincronización al editar su foto acá.
    void AuthService.syncProfilePicture(
      internalUser.id,
      internalUser.avatarFileId,
      providerToken,
      internalUser.syncProfileWithIntegration,
    );
    // Y el directorio de contactos (con throttle): es acá, con el token del
    // proveedor que solo existe en este momento, y no al listar usuarios.
    void AuthService.syncDirectoryThrottled(providerToken);
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
        metadata: { provider: env.auth.mode, reason: mapLoginFailureReason(error) },
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
