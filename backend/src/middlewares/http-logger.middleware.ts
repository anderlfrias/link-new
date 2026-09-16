import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Request } from "express";
import pinoHttp from "pino-http";
import { logger } from "../config/logger";

/// Forma del `req` que pino-http realmente pasa a un serializer custom: ya
/// envuelto por su serializer estándar (`id`/`method`/`url`/`headers`, ver
/// pino-std-serializers#SerializedRequest), con el objeto Express original en
/// `.raw`. Definido acá en vez de importado de `pino-std-serializers` (dependencia
/// transitiva de pino-http, no declarada en package.json) para no acoplar este
/// archivo a su forma interna completa — solo necesitamos estos cinco campos.
interface WrappedRequest {
  id: string | undefined;
  method: string;
  url: string;
  headers: Record<string, string>;
  raw: IncomingMessage;
}

/// Nivel según el resultado de la request: 5xx → error, 4xx → warn, resto →
/// info. Si todo fuera "info", el log no se podría filtrar por "cosas que
/// salieron mal". Exportada aparte (en vez de inline en `pinoHttp({...})`)
/// para poder testearla directo, sin depender de capturar logs vía supertest.
export function customLogLevel(_req: IncomingMessage, res: ServerResponse, err?: Error) {
  if (err || res.statusCode >= 500) return "error" as const;
  if (res.statusCode >= 400) return "warn" as const;
  return "info" as const;
}

/// GET / es el health check ("Backend is running") — ruido puro, no se loguea.
export function shouldIgnoreRequest(req: IncomingMessage) {
  return req.url === "/";
}

/// Serializer de `req`: SOLO el pathname, nunca el query string. Las URLs de
/// contenido de archivo son `/v1/files/:id/content?t=<hmac firmado>` (ver
/// FILE_URL_SIGNING_SECRET en env.ts) — loguear la URL completa deja tokens de
/// acceso a archivos en el log, la misma clase de fuga que la de
/// auth.service.ts por otra vía.
///
/// `req` llega ya envuelto por el serializer estándar de pino (`id`, `method`,
/// `url`, `headers`, ...) — el objeto Express original está en `req.raw` (ver
/// pino-http#custom-serializers, "wrapSerializers"). `trust proxy` ya está en 1
/// (ver app.ts), así que `req.raw.ip` es el visitante real y no la IP de Cloudflare.
export function serializeRequest(req: WrappedRequest) {
  return {
    id: req.id,
    method: req.method,
    url: req.url.split("?")[0],
    ip: (req.raw as Request)?.ip,
    userAgent: req.headers["user-agent"],
  };
}

/// Access log HTTP. Reemplaza a `morgan("dev")`, que emitía un formato pensado
/// para mirar una terminal (coloreado, sin usuario, sin id de correlación) y no
/// servía para filtrar ni alertar en producción.
export const httpLogger = pinoHttp({
  logger,

  /// Un UUID nuevo por request, devuelto también en el header de respuesta para
  /// que un usuario que reporta un error pueda citar el id exacto.
  /// A propósito NO se confía en un `x-request-id` entrante: es input de un
  /// cliente y no aporta nada hoy (el frontend no manda ninguno).
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },

  customLogLevel,

  /// El usuario se identifica por UUID interno, nunca por email (LOGGING_PLAN §4.4).
  /// `undefined` en rutas sin autenticar — pino omite los campos undefined.
  customProps: (req) => ({ userId: (req as Request).user?.internalUserId }),

  serializers: {
    req: serializeRequest,
    res: (res) => ({ statusCode: res.statusCode }),
  },

  autoLogging: {
    ignore: shouldIgnoreRequest,
  },
});
