import { NextFunction, Request, Response } from "express";
import { bindContext } from "../config/request-context";
import { resolveInternalUser } from "../modules/auth/identity";
import { UnauthorizedError } from "../utils/errors";

/// `authenticate` solo verifica el token y expone lo que dice. Este middleware
/// lo resuelve contra la tabla `User` local (`resolveInternalUser`,
/// LOCAL_AUTH_PLAN.md D7): agrega el `id` interno en `req.user.internalUserId`,
/// rechaza cuentas desactivadas, tokens revocados o más viejos que la duración
/// de sesión vigente, y completa nombre, username y roles desde la base.
/// Cualquier módulo que necesite
/// relacionar datos con `User` (conversaciones, mensajes, etc.) debe aplicar
/// este middleware después de `authenticate`.
export async function attachInternalUser(req: Request, _res: Response, next: NextFunction) {
  // Sin `authIdentity` la request no pasó por `authenticate`: falla cerrado.
  if (!req.user || !req.authIdentity) {
    return next(new UnauthorizedError());
  }

  try {
    const { user, record } = await resolveInternalUser(req.authIdentity);
    req.user = user;
    // A partir de acá toda línea de log de esta request lleva el usuario, y el
    // audit trail puede registrar la identidad del actor sin que ningún service
    // reciba un parámetro nuevo. En el log va el UUID y no el email
    // (LOGGING_PLAN.md §4.4); el email va solo al meta, que consume el audit.
    bindContext({
      logFields: { userId: record.id },
      meta: { actorUserId: record.id, actorEmail: record.email },
    });
    next();
  } catch (error) {
    next(error);
  }
}
