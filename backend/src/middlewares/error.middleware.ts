import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { AppError } from "../utils/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // multer valida tamaño/cantidad de archivos antes de que file.route.ts vea el
  // request — sus errores nunca pasan por un AppError, hay que traducirlos acá.
  if (err instanceof MulterError) {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
