import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as AuthService from "./auth.service";
import { mapTokenToUser, verifyToken } from "./jwt";

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, password } = req.body as { user?: string; password?: string };
    if (!user || !password) {
      throw new BadRequestError("Ingresá tu usuario y tu contraseña.");
    }

    const token = await AuthService.login(user, password);
    const mappedUser = mapTokenToUser(verifyToken(token));
    const internalUser = await AuthService.upsertUsuario(mappedUser);

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
