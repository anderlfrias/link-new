import { NextFunction, Request, Response } from "express";
import * as UserService from "./user.service";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined;
    // `authenticate` (middleware previo) ya validó el formato "Bearer <token>".
    const token = req.headers.authorization!.slice("Bearer ".length);
    const users = await UserService.listUsers(currentUserId(req), token, search);
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined;
    const token = req.headers.authorization!.slice("Bearer ".length);

    const result = await UserService.listUsersForAdmin(
      token,
      { search },
      { beforeId: before, limit: Number.isFinite(limit) ? limit : undefined },
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}
