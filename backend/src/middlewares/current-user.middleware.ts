import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { bindContext } from "../config/request-context";
import { UnauthorizedError } from "../utils/errors";

/// `authenticate` solo verifica el JWT de EXTERNAL_AUTH y expone el id externo
/// (`req.user.id`) — nunca se usa en relaciones de Prisma. Este middleware
/// resuelve el `id` interno (UUID en la tabla `User` local) a partir del email
/// y lo agrega a `req.user.internalUserId`. Cualquier módulo que necesite
/// relacionar datos con `User` (conversaciones, mensajes, etc.) debe aplicar
/// este middleware después de `authenticate`.
export async function attachInternalUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.email } });
    if (!user) {
      return next(new UnauthorizedError("User not found"));
    }
    req.user.internalUserId = user.id;
    // A partir de acá toda línea de log de esta request lleva el usuario, y el
    // audit trail puede registrar la identidad del actor sin que ningún service
    // reciba un parámetro nuevo. En el log va el UUID y no el email
    // (LOGGING_PLAN.md §4.4); el email va solo al meta, que consume el audit.
    bindContext({
      logFields: { userId: user.id },
      meta: { actorUserId: user.id, actorEmail: user.email },
    });
    next();
  } catch (error) {
    next(error);
  }
}
