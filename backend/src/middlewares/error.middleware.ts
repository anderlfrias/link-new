import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { getLogger } from "../config/request-context";
import { AppError } from "../utils/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const log = getLogger();

  if (err instanceof AppError) {
    // Un 4xx no es un bug del server (un 403 es el sistema funcionando), así
    // que va en warn y sin stack. Un AppError 5xx sí — ServiceUnavailableError
    // significa que EXTERNAL_AUTH o Giphy no responden, y ahí el stack importa.
    if (err.statusCode >= 500) {
      log.error({ err, statusCode: err.statusCode }, "request failed");
    } else {
      log.warn({ statusCode: err.statusCode, error: err.name, reason: err.message }, "request rejected");
    }
    return res.status(err.statusCode).json({ error: err.message });
  }

  // multer valida tamaño/cantidad de archivos antes de que file.route.ts vea el
  // request — sus errores nunca pasan por un AppError, hay que traducirlos acá.
  if (err instanceof MulterError) {
    log.warn({ statusCode: 400, error: err.name, reason: err.message, field: err.field }, "upload rejected");
    return res.status(400).json({ error: err.message });
  }

  // Lo único verdaderamente inesperado: acá sí va el stack completo.
  log.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
