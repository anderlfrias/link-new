import * as AuditRepository from "../modules/audit/audit.repository";
import * as SettingsService from "../modules/settings/settings.service";
import { getLogger } from "../config/request-context";
import { runWorkerTick } from "./worker-context";

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/// Borrado FÍSICO de filas de auditoría más viejas que
/// `AppSettings.auditLogRetentionDays`. A diferencia de los mensajes (borrado
/// lógico con `deletedAt`), acá el borrado es real: una fila de auditoría
/// marcada como borrada pero presente no sirve a ningún propósito — o el
/// registro se conserva, o se elimina. Un "audit log soft-deleted" es lo peor
/// de los dos mundos (ocupa lugar y no se puede usar como evidencia).
///
/// `null` (default) significa deshabilitado: nunca borra nada a menos que un
/// admin lo prenda explícitamente.
export async function runAuditRetentionSweep(): Promise<void> {
  const settings = await SettingsService.getSettings();
  if (settings.auditLogRetentionDays == null) {
    return;
  }

  const cutoffDate = new Date(Date.now() - settings.auditLogRetentionDays * 24 * 60 * 60 * 1000);
  const deletedCount = await AuditRepository.deleteOlderThan(cutoffDate);
  if (deletedCount > 0) {
    // info y no debug: el borrado de registros de auditoría es justamente algo
    // que tiene que quedar registrado en algún lado.
    getLogger().info({ deletedCount, cutoffDate }, "audit logs purged by retention policy");
  }
}

/// Cada 24 h y no cada hora como el de mensajes: la retención de auditoría se
/// mide en meses, un barrido diario es de sobra y evita una query de borrado
/// masivo repetida sin necesidad.
export function startAuditRetentionWorker(): void {
  void runWorkerTick("audit-retention", runAuditRetentionSweep);
  setInterval(() => {
    void runWorkerTick("audit-retention", runAuditRetentionSweep);
  }, SWEEP_INTERVAL_MS);
}
