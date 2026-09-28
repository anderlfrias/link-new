import type { NextFunction, Request, Response } from "express";
import { runWithContext } from "../config/request-context";
import { logger } from "../config/logger";

/// Abre el contexto de la request. Debe montarse DESPUÉS de `httpLogger`: el
/// `requestId` lo genera ese middleware (`req.id`), y acá solo se hereda para
/// que toda línea emitida río abajo se pueda atar a la misma request.
///
/// `req.ip` es el visitante real y no la IP de Cloudflare gracias a
/// `app.set("trust proxy", 1)` (ver app.ts) — de ahí que valga la pena
/// guardarlo en el audit trail.
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  const requestId = (req as Request & { id?: string }).id;
  const child = logger.child({ requestId });
  const ip = (req.headers["cf-connecting-ip"] as string | undefined) ?? req.ip;
  runWithContext(child, { requestId, ip, userAgent: req.headers["user-agent"] }, () => next());
}
