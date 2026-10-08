import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { getLogger } from "../config/request-context";
import { AppError } from "../utils/errors";

/// Errores de cliente que arma body-parser (`express.json()`): JSON mal
/// formado → 400, body más grande que el límite → 413, charset no soportado →
/// 415. Siguen la convención de http-errors: `status` 4xx y `expose: true`.
/// Antes caían en el 500 genérico y se logueaban con el error entero, que trae
/// el body crudo en `err.body` — contraseñas incluidas, si era un login.
function isClientHttpError(err: unknown): err is { status: number; type?: string } {
  if (typeof err !== "object" || err === null) return false;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === "number" && status >= 400 && status < 500 && expose === true;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const log = getLogger();

  if (err instanceof AppError) {
    // Un 4xx no es un bug del server (un 403 es el sistema funcionando), así
    // que va en warn y sin stack. Un AppError 5xx sí — ServiceUnavailableError
    // significa que un proveedor externo (de autenticación o Giphy) no responde, y ahí el stack importa.
    if (err.statusCode >= 500) {
      log.error({ err, statusCode: err.statusCode }, "request failed");
    } else {
      log.warn({ statusCode: err.statusCode, error: err.name, reason: err.message }, "request rejected");
    }
    return res
      .status(err.statusCode)
      .json({ ...err.details, error: err.message, ...(err.code ? { code: err.code } : {}) });
  }

  // multer valida tamaño/cantidad de archivos antes de que file.route.ts vea el
  // request — sus errores nunca pasan por un AppError, hay que traducirlos acá.
  if (err instanceof MulterError) {
    log.warn({ statusCode: 400, error: err.name, reason: err.message, field: err.field }, "upload rejected");
    return res.status(400).json({ error: err.message });
  }

  // Sin el err en el log: ver isClientHttpError.
  if (isClientHttpError(err)) {
    log.warn({ statusCode: err.status, error: err.type }, "request rejected");
    return res
      .status(err.status)
      .json({ error: err.status === 413 ? "Request body too large" : "Invalid request body" });
  }

  // Lo único verdaderamente inesperado: acá sí va el stack completo.
  log.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
