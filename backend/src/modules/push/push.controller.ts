import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as PushService from "./push.service";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

export function getPublicKey(_req: Request, res: Response) {
  res.json({ publicKey: PushService.getPublicKey() });
}

export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const { endpoint, keys } = req.body ?? {};
    if (typeof endpoint !== "string" || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
      throw new BadRequestError("Missing endpoint or keys");
    }
    await PushService.subscribe(currentUserId(req), { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function unsubscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const { endpoint } = req.body ?? {};
    if (typeof endpoint !== "string") {
      throw new BadRequestError("Missing endpoint");
    }
    await PushService.unsubscribe(endpoint);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
