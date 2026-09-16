import * as MessageRepository from "../modules/messages/message.repository";
import * as SettingsService from "../modules/settings/settings.service";
import { runWorkerTick } from "./worker-context";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/// Borrado lógico de mensajes más viejos que `AppSettings.messageRetentionDays`.
/// `null` (default) significa deshabilitado — nunca corre nada a menos que un
/// admin lo prenda explícitamente desde el panel de configuración.
async function runRetentionSweep(): Promise<void> {
  const settings = await SettingsService.getSettings();
  if (settings.messageRetentionDays == null) {
    return;
  }

  const cutoffDate = new Date(Date.now() - settings.messageRetentionDays * 24 * 60 * 60 * 1000);
  const deletedCount = await MessageRepository.softDeleteOlderThan(cutoffDate);
  if (deletedCount > 0) {
    console.log(`[message-retention] Soft-deleted ${deletedCount} message(s) older than ${cutoffDate.toISOString()}`);
  }
}

/// No hay infraestructura de scheduler/cola de jobs en este backend (corre
/// siempre en un único proceso Node, ver server.ts) — un `setInterval` es
/// proporcional al tamaño del proyecto. Si en el futuro hace falta que la
/// retención sobreviva reinicios con precisión, o corra en múltiples
/// instancias, esto debería migrar a `node-cron` o una cola real.
export function startMessageRetentionWorker(): void {
  void runWorkerTick("message-retention", runRetentionSweep);
  setInterval(() => {
    void runWorkerTick("message-retention", runRetentionSweep);
  }, SWEEP_INTERVAL_MS);
}
