import { prisma } from "../../config/prisma";
import { getLogger } from "../../config/request-context";

/// Cuánto se espera a la base antes de dar el chequeo por fallido. Más corto que el
/// `timeout` del HEALTHCHECK de Docker (5 s), para que el backend responda 503 en vez
/// de que Docker corte la conexión.
export const DATABASE_CHECK_TIMEOUT_MS = 3000;

/// `true` si la base de datos responde a una consulta trivial (`SELECT 1`) dentro de
/// `timeoutMs`. Nunca lanza: cualquier falla (base caída, conexión colgada) es `false`.
/// Solo se loguea el nombre y el mensaje del error, nunca la cadena de conexión.
export async function checkDatabase(timeoutMs: number = DATABASE_CHECK_TIMEOUT_MS): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database check timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (error) {
    getLogger().warn(
      {
        errName: error instanceof Error ? error.name : "Error",
        errMessage: error instanceof Error ? error.message : String(error),
      },
      "health check: database unavailable",
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
