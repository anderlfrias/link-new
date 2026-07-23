import { NextFunction, Request, Response } from "express";
import { AnySchema, ValidationError } from "yup";
import { BadRequestError } from "../utils/errors";

/// Valida y sanea `req.body` contra un schema de yup antes de llegar al
/// controlador. En caso de error, siempre responde `400` con el detalle de
/// validación (nunca deja pasar un `ValidationError` crudo al error handler).
export function validateBody(schema: AnySchema) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        return next(new BadRequestError(error.errors.join(", ")));
      }
      next(error);
    }
  };
}
