import http from "http";
import app from "./app";
import { initAuthProvider } from "./auth-providers/init";
import { currentProviderId } from "./auth-providers/registry";
import env, { envWarnings } from "./config/env";
import { logger } from "./config/logger";
import { initSocket } from "./socket";
import { startMessageRetentionWorker } from "./workers/message-retention.worker";
import { startUploadCleanupWorker } from "./workers/upload-cleanup.worker";
import { startFileMigrationWorker } from "./workers/file-migration.worker";
import { startAuditRetentionWorker } from "./workers/audit-retention.worker";

const PORT = env.PORT;

// Node corta el socket a los 5 min (default `server.requestTimeout`) si el
// request —headers + body— no terminó de llegar. Para JSON normal nunca se
// nota, pero mata en silencio la subida de un archivo grande en una conexión
// lenta: el límite configurable (AppSettings.maxUploadSizeMb, ver
// file.service.ts) y el techo duro de multer recién corren con el body ya
// completo, así que un archivo bien dentro del límite pero lento de subir
// nunca llega a esa validación — el cliente ve un corte de conexión genérico,
// no un 4xx entendible (ver error.middleware.ts, que no tiene nada que
// traducir acá porque el request ni terminó). Subimos el techo en vez de
// desactivarlo (0) porque toda ruta de este backend exige JWT — el riesgo de
// slow-loris ya requiere estar autenticado.
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

/// Valida el proveedor de autenticación antes de abrir nada: si su configuración es
/// inválida, el backend no arranca (igual que con un `.env` inválido).
async function start() {
  await initAuthProvider();

  const httpServer = http.createServer(app);
  httpServer.requestTimeout = REQUEST_TIMEOUT_MS;
  initSocket(httpServer);
  startMessageRetentionWorker();
  startUploadCleanupWorker();
  startFileMigrationWorker();
  startAuditRetentionWorker();

  // env.ts no puede loguearlos: cuando valida el .env todavía no existe el logger.
  envWarnings.forEach((warning) => logger.warn(warning));

  httpServer.listen(PORT, () => {
    // Quién autentica queda a la vista al arrancar: "local" o el id del proveedor externo.
    logger.info({ port: PORT, authProvider: currentProviderId() }, "server listening");
  });
}

start().catch((error) => {
  logger.fatal({ err: error }, "failed to start");
  process.exit(1);
});
