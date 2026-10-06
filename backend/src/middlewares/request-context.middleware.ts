import type { NextFunction, Request, Response } from "express";
import { getClientIp } from "../config/client-ip";
import { runWithContext } from "../config/request-context";
import { logger } from "../config/logger";

/// Abre el contexto de la request. Debe montarse DESPUÉS de `httpLogger`: el
/// `requestId` lo genera ese middleware (`req.id`), y acá solo se hereda para
/// que toda línea emitida río abajo se pueda atar a la misma request.
///
/// La IP es la del visitante real y no la del proxy gracias a TRUST_PROXY y
/// TRUST_CF_CONNECTING_IP (ver config/client-ip.ts) — de ahí que valga la
/// pena guardarla en el audit trail.
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  const requestId = (req as Request & { id?: string }).id;
  const child = logger.child({ requestId });
  const ip = getClientIp(req);
  runWithContext(child, { requestId, ip, userAgent: req.headers["user-agent"] }, () => next());
}
