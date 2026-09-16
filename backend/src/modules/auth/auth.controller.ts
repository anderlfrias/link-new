import { NextFunction, Request, Response } from "express";
import { AuditAction } from "@prisma/client";
import {
  BadRequestError,
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../../utils/errors";
import * as AuditService from "../audit/audit.service";
import * as AuthService from "./auth.service";
import { mapTokenToUser, verifyToken } from "./jwt";

export function mapLoginFailureReason(
  error: unknown,
): "forbidden_by_provider" | "invalid_credentials" | "provider_error" | "provider_unreachable" {
  if (error instanceof ForbiddenError) {
    return "forbidden_by_provider";
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

    const token = await AuthService.login(user, password);
    const mappedUser = mapTokenToUser(verifyToken(token));
    const internalUser = await AuthService.upsertUsuario(mappedUser);

    void AuditService.record({
      action: AuditAction.LOGIN,
      userId: internalUser.id,
      actorEmail: mappedUser.email,
    });

    res.json({
      token,
      // `fullName` sale de `internalUser.name` (esta base), no de `mappedUser`
      // (el JWT del proveedor externo tal cual): si este usuario ya cambió su
      // nombre acá, `upsertUsuario` no lo pisó (ver auth.repository.ts), pero
      // el JWT externo sigue teniendo el nombre viejo — mandar `mappedUser.fullName`
      // acá mostraría ese nombre viejo en el propio cliente aunque la base ya
      // tenga el correcto.
      user: {
        ...mappedUser,
        fullName: internalUser.name,
        internalUserId: internalUser.id,
        notificationSoundEnabled: internalUser.notificationSoundEnabled,
      },
    });

    // Fire-and-forget: no debe retrasar ni romper el login si el proveedor
    // externo está lento o caído (syncProfilePicture nunca lanza — ver
    // auth.service.ts). No hace nada si este usuario ya desactivó la
    // sincronización al editar su foto acá.
    void AuthService.syncProfilePicture(
      internalUser.id,
      internalUser.avatarFileId,
      token,
      internalUser.syncProfileWithIntegration,
    );
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
        metadata: { reason: mapLoginFailureReason(error) },
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
    const { notificationSoundEnabled } = req.body as { notificationSoundEnabled: boolean };
    const userId = req.user!.internalUserId!;
    const updated = await AuthService.updateNotificationSoundEnabled(userId, notificationSoundEnabled);
    res.json({ notificationSoundEnabled: updated.notificationSoundEnabled });
  } catch (error) {
    next(error);
  }
}
