import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";
import { logger as rootLogger } from "./logger";

/// Datos ambientales de la petición en curso. Los consumen dos cosas distintas:
/// el logger (para etiquetar cada línea) y el audit trail (para registrar desde
/// dónde se hizo una acción — ver LOGGING_PLAN.md §2.2 problema 3).
///
/// Todos opcionales a propósito: un tick de worker no tiene IP ni actor, y un
/// socket no tiene requestId HTTP.
export type RequestMeta = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
  /// UUID interno del actor (tabla `User`). Lo consume el audit trail como
  /// default de `userId`, para que auditar una acción no obligue a cambiar la
  /// firma del service que la ejecuta (ver Fase 3).
  actorUserId?: string;
  /// Identidad del actor tal como la presentó. Va al audit trail, nunca a un
  /// log de aplicación (LOGGING_PLAN.md §4.4).
  actorEmail?: string;
};

/// El store es mutable a propósito (ver `bindContext`): el usuario no se conoce
/// cuando arranca la request — recién aparece después de `authenticate` y
/// `attachInternalUser`.
type RequestContext = { logger: Logger; meta: RequestMeta };

const storage = new AsyncLocalStorage<RequestContext>();

/// Abre un contexto para todo lo que pase abajo (incluidos los `await`
/// encadenados). Usado por los tres bordes de entrada: middleware HTTP,
/// middleware de socket y tick de worker.
export function runWithContext<T>(logger: Logger, meta: RequestMeta, fn: () => T): T {
  return storage.run({ logger, meta }, fn);
}

/// Agrega campos al contexto actual: `logFields` al logger (aparecen en cada
/// línea posterior) y `meta` a los datos ambientales. No-op si no hay contexto
/// (ej. código llamado desde un test unitario o al arrancar el proceso).
export function bindContext(opts: { logFields?: Record<string, unknown>; meta?: RequestMeta }): void {
  const store = storage.getStore();
  if (!store) return;
  if (opts.logFields) {
    store.logger = store.logger.child(opts.logFields);
  }
  if (opts.meta) {
    store.meta = { ...store.meta, ...opts.meta };
  }
}

/// El logger del contexto actual, o el raíz si no hay ninguno. Nunca devuelve
/// undefined a propósito: un service no debería tener que saber si lo llamó una
/// request HTTP, un socket o un worker para poder loguear.
export function getLogger(): Logger {
  return storage.getStore()?.logger ?? rootLogger;
}

/// Los datos ambientales del contexto actual, o `{}` fuera de todo contexto.
/// La Fase 3 lo usa para completar `ip`/`userAgent`/`requestId` de cada fila de
/// auditoría sin cambiar la firma de ningún service.
export function getRequestMeta(): RequestMeta {
  return storage.getStore()?.meta ?? {};
}
