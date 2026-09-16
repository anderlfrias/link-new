import { randomUUID } from "node:crypto";
import { logger } from "../config/logger";
import { runWithContext } from "../config/request-context";

/// Abre un contexto de logging por pasada de worker. `tickId` permite agrupar
/// todas las líneas de una misma pasada, que es la unidad que importa cuando
/// una limpieza procesa 50 archivos y 3 fallan.
///
/// El meta va vacío a propósito: una pasada de worker no tiene IP ni actor
/// humano. Si un worker alguna vez audita algo, esa fila debe quedar sin `ip`
/// y sin `userId` — es correcto, la hizo el sistema y no una persona.
export function runWorkerTick(worker: string, fn: () => Promise<void>): Promise<void> {
  return runWithContext(logger.child({ worker, tickId: randomUUID() }), {}, fn);
}
