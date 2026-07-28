import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as AuthService from "./auth.service";
import { mapTokenToUser, verifyToken } from "./jwt";

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, password } = req.body as { user?: string; password?: string };
    if (!user || !password) {
      throw new BadRequestError("user and password are required");
    }

    const token = await AuthService.login(user, password);
    const mappedUser = mapTokenToUser(verifyToken(token));
    const internalUser = await AuthService.upsertUsuario(mappedUser);

    res.json({
      token,
      user: { ...mappedUser, internalUserId: internalUser.id },
    });

    // Fire-and-forget: no debe retrasar ni romper el login si EXTERNAL_AUTH está lento
    // o caído (syncProfilePicture nunca lanza — ver auth.service.ts).
    void AuthService.syncProfilePicture(internalUser.id, internalUser.avatarFileId, token);
  } catch (error) {
    next(error);
  }
}

export async function getProfilePicture(req: Request, res: Response, next: NextFunction) {
  try {
    // `authenticate` (middleware previo) ya validó el formato "Bearer <token>".
    const token = req.headers.authorization!.slice("Bearer ".length);
    const picture = await AuthService.getProfilePicture(token);

    res.setHeader("Content-Type", picture.contentType);
    // La foto de perfil cambia poco — evita repetir el proxy a EXTERNAL_AUTH en cada
    // render de <Avatar> mientras dure la sesión del browser.
    res.setHeader("Cache-Control", "private, max-age=300");
    // Sin esto, la caché HTTP del navegador solo distingue por URL: si un
    // usuario cierra sesión y otro entra en la misma pestaña dentro de esos
    // 300s, el fetch a esta misma URL con OTRO token puede devolver de caché
    // los bytes de la foto del usuario anterior en vez de pedirla de nuevo.
    res.setHeader("Vary", "Authorization");
    res.send(picture.buffer);
  } catch (error) {
    next(error);
  }
}
