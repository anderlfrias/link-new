import { NextFunction, Request, Response } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { mapTokenToUser, verifyToken } from "../modules/auth/jwt";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing token"));
  }

  const token = header.slice("Bearer ".length);

  try {
    req.user = mapTokenToUser(verifyToken(token));
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return next(new UnauthorizedError("Token expired"));
    }
    return next(new UnauthorizedError("Invalid token"));
  }
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
