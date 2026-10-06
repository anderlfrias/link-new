import { NextFunction, Request, Response } from "express";
import env from "../config/env";
import { bindContext } from "../config/request-context";
import { resolveInternalUser } from "../modules/auth/identity";
import { UnauthorizedError } from "../utils/errors";

/// `authenticate` solo verifica el token y expone lo que dice. Este middleware
/// lo resuelve contra la tabla `User` local (`resolveInternalUser`,
/// LOCAL_AUTH_PLAN.md D7): agrega el `id` interno en `req.user.internalUserId`
/// y rechaza cuentas desactivadas y, en modo local, tokens revocados o más
/// viejos que la duración de sesión vigente. En modo local además completa
/// nombre, username y roles desde la base. Cualquier módulo que necesite
/// relacionar datos con `User` (conversaciones, mensajes, etc.) debe aplicar
/// este middleware después de `authenticate`.
export async function attachInternalUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  try {
    // Sin `authIdentity` (no pasó por `authenticate`) solo puede tratarse de
    // un token de EXTERNAL_AUTH: en modo local falta `iat` y `resolveInternalUser`
    // falla cerrado.
    const identity = req.authIdentity ?? { mode: env.auth.mode, user: req.user, mustChangePassword: false };
    const { user, record } = await resolveInternalUser(identity);
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
