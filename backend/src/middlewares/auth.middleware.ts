import { NextFunction, Request, Response } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { isExternalProvider } from "../auth-providers/registry";
import { assertNotPasswordChangeOnly } from "../modules/auth/identity";
import { verifyAccessToken } from "../modules/auth/jwt";
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from "../utils/errors";

/// Verifica el token con el verificador del modo activo (LOCAL_AUTH_PLAN.md,
/// D6) y deja el usuario en `req.user`. No consulta la base: eso lo hace
/// `attachInternalUser`, que todas las rutas montan después. En modo local
/// `req.user.roles` queda vacío hasta entonces, así que un `requireRoles` sin
/// `attachInternalUser` falla cerrado (D7).
function authenticateRequest(req: Request, next: NextFunction, allowPasswordChangeOnly: boolean) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing token"));
  }

  const token = header.slice("Bearer ".length);

  try {
    const identity = verifyAccessToken(token);
    if (!allowPasswordChangeOnly) {
      assertNotPasswordChangeOnly(identity);
    }
    req.user = identity.user;
    req.authIdentity = identity;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (error instanceof TokenExpiredError) {
      return next(new UnauthorizedError("Token expired"));
    }
    return next(new UnauthorizedError("Invalid token"));
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  authenticateRequest(req, next, false);
}

/// Como `authenticate`, pero también acepta un token restringido (`pcr`):
/// solo para `PATCH /auth/password`, el único lugar donde ese token sirve (D13).
export function authenticateForPasswordChange(req: Request, _res: Response, next: NextFunction) {
  authenticateRequest(req, next, true);
}

/// Rutas que solo existen con cuentas locales (LOCAL_AUTH_PLAN.md §7): con un
/// proveedor externo responden 404, como si no estuvieran montadas. Se decide en
/// cada request y no al montar el router, así los tests pueden cambiar de modo sin
/// reimportar.
export function localAuthOnly() {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (isExternalProvider()) {
      return next(new NotFoundError());
    }
    next();
  };
}

export function requireRoles(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles ?? [];
    const authorized = roles.some((role) => userRoles.includes(role));
    if (!authorized) {
      return next(new ForbiddenError("Insufficient role"));
    }
    next();
  };
}
