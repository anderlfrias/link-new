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
  } catch (error) {
    next(error);
  }
}
