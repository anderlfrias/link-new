import { UserStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import env from "../../config/env";
import { validateBody } from "../../middlewares/validate.middleware";
import * as AccountAdminService from "./account-admin.service";
import * as UserService from "./user.service";
import { updateLocalUserSchema, updateExternalUserUserSchema } from "./user.validator";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined;
    const users = await UserService.listUsers(currentUserId(req), search);
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
    const status = Object.values(UserStatus).find((value) => value === req.query.status);
    const hasPassword =
      env.auth.mode === "local" && (req.query.hasPassword === "true" || req.query.hasPassword === "false")
        ? req.query.hasPassword === "true"
        : undefined;

    const result = await UserService.listUsersForAdmin(
      { search, status, hasPassword },
      { beforeId: before, limit: Number.isFinite(limit) ? limit : undefined },
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/// Desde el panel: el actor es el admin de la request (el audit lo toma del
/// contexto que deja `attachInternalUser`).
function panelActor(req: Request): AccountAdminService.AccountAdminActor {
  return { userId: req.user!.internalUserId!, via: "panel" };
}

/// El body permitido depende del modo (LOCAL_AUTH_PLAN.md §7): en external-auth solo
/// `status`. Se decide en cada request, igual que `requireAuthMode`.
export function validateUpdateAccount(req: Request, res: Response, next: NextFunction) {
  const schema = env.auth.mode === "local" ? updateLocalUserSchema : updateExternalUserUserSchema;
  return validateBody(schema)(req, res, next);
}

export async function updateAccount(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AccountAdminService.updateUserAccount(panelActor(req), req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function createAccount(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await AccountAdminService.createLocalUser(panelActor(req), req.body));
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AccountAdminService.resetLocalPassword(panelActor(req), req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function unlock(req: Request, res: Response, next: NextFunction) {
  try {
    await AccountAdminService.unlockLocalUser(panelActor(req), req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
