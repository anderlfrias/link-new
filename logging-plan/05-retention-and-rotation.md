# Fase 5 — Retención del audit trail y rotación de los logs

**Prerrequisitos:** Fases 0 a 3 cerradas (la Fase 4 no es necesaria, pero conviene tenerla para
poder ver el efecto).
**Deja andando:** los logs de aplicación dejan de crecer sin techo hasta llenar el disco, y la
tabla de auditoría tiene una política de retención configurable.
**Los dos problemas 🟡 que cierra:** el 7 (sin rotación ni retención) y el 9 (el gotcha de
`time: true` en PM2, que **corrompe los logs JSON de la Fase 0** — es más urgente de lo que su
color sugiere).

---

## 5.1 🟠 Arreglar el `time: true` de PM2

`ecosystem.config.js` tiene `time: true` en las dos apps. Esa opción hace que PM2 **prefije su
propio timestamp a cada línea**:

```
2026-09-16T10:22:04: {"level":30,"time":"2026-09-16T10:22:04.123Z","msg":"server listening"}
```

Eso ya no es JSON válido. `jq`, Loki, Datadog o cualquier parseo por línea falla. Y pino ya emite
su propio campo `time` en ISO-8601 (Fase 0), así que el prefijo además es redundante.

En `ecosystem.config.js`, para la app `link-backend`:

```js
      // false a propósito: pino ya emite su propio campo `time` en ISO-8601
      // (ver src/config/logger.ts). Con `time: true`, PM2 prefija un timestamp
      // a cada línea y rompe el JSON — dejaría el log ilegible para jq y para
      // cualquier agregador. Ver logging-plan/05-retention-and-rotation.md.
      time: false,
```

`link-frontend` **sí puede conservar `time: true`**: Next.js no emite JSON estructurado, sus líneas
son texto libre y ahí el timestamp de PM2 es lo único que las ubica en el tiempo. Anotá esa
asimetría en el comentario para que nadie la "unifique" después.

Aprovechá para fijar el nivel de log de producción en el bloque `env` del backend:

```js
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },
```

- [ ] `time: false` en `link-backend`, con el comentario del por qué
- [ ] `time: true` conservado en `link-frontend`, con el comentario de la asimetría
- [ ] `LOG_LEVEL: "info"` en el `env` del backend

### Test

Esto es configuración de infraestructura sin lógica, así que entra en la excepción de
[AGENTS.md](../AGENTS.md) y no requiere test unitario. Sí requiere verificación manual (§5.5).

---

## 5.2 Rotación de los archivos de log (PM2)

Hoy PM2 escribe en `~/.pm2/logs/link-backend-out.log` y `-error.log` sin techo. Con logging
estructurado por request, un chat de uso normal genera bastante más volumen que antes: sin rotación
esto termina llenando el disco del server.

Es operación, no código. Dos pasos, **en el server de producción**:

```bash
pm2 install pm2-logrotate
```

```bash
pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 14 && pm2 set pm2-logrotate:compress true
```

Eso deja 14 archivos comprimidos de hasta 50 MB por app. Ajustá según el disco disponible; lo que
importa es que exista un techo.

Opcionalmente, rutas explícitas en `ecosystem.config.js` para que los logs vivan con la app en
lugar de en `~/.pm2/logs`:

```js
      out_file: "./logs/backend-out.log",
      error_file: "./logs/backend-error.log",
```

Si lo hacés, **agregá `logs/` al `.gitignore`** (el `.gitignore` actual solo cubre
`npm-debug.log*` y similares, no un directorio de logs de la app).

- [ ] `pm2-logrotate` instalado y configurado en el server
- [ ] `pm2 conf pm2-logrotate` verificado (muestra los valores fijados)
- [ ] Si se usaron rutas explícitas: `logs/` agregado al `.gitignore`
- [ ] Documentado en el comentario de cabecera de `ecosystem.config.js`, que ya explica el flujo de
      PM2 — el próximo operador tiene que enterarse ahí, no en este plan

---

## 5.3 Retención de la tabla de auditoría

`Message` ya tiene `messageRetentionDays` y los archivos tienen `orphanFileRetentionHours` /
`softDeletedFilePurgeDays`. El audit trail es el único dato que crece sin ninguna política.

### Campo en `AppSettings`

En `backend/prisma/schema.prisma`, dentro de `model AppSettings`, junto a los otros campos de
retención:

```prisma
  // Retención del audit trail (ver src/modules/audit/README.md).
  /// null = deshabilitado (default): el audit trail se guarda para siempre.
  /// A diferencia del resto de los campos de retención, acá "para siempre" es
  /// además el default correcto por cumplimiento — borrar registros de
  /// auditoría es una decisión que un admin tiene que tomar explícitamente,
  /// nunca algo que pase por omisión al actualizar la app.
  auditLogRetentionDays Int? @map("audit_log_retention_days")
```

```bash
npm run prisma:sync --workspace=backend
```

### El worker

`backend/src/workers/audit-retention.worker.ts`, calcado de `message-retention.worker.ts`
(incluido su comentario sobre por qué un `setInterval` alcanza en este proyecto):

```ts
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
async function runAuditRetentionSweep(): Promise<void> {
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
```

En `audit.repository.ts`:

```ts
export async function deleteOlderThan(cutoffDate: Date): Promise<number> {
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoffDate } } });
  return result.count;
}
```

> El índice `@@index([createdAt])` que agregó la Fase 3 es lo que hace que este `deleteMany` no
> escanee la tabla entera. Si lo salteaste ahí, volvé y agregalo.

Y en `server.ts`, registrarlo junto a los otros tres:

```ts
startAuditRetentionWorker();
```

- [ ] `auditLogRetentionDays` en `AppSettings`, default `null`, con su comentario
- [ ] `db push` aplicado
- [ ] `audit-retention.worker.ts` creado y arrancado en `server.ts`
- [ ] `deleteOlderThan` en `audit.repository.ts`

### Tests obligatorios — `audit-retention.worker.test.ts`

Mockear `SettingsService.getSettings` y `AuditRepository`.

- [ ] Con `auditLogRetentionDays: null` → **no** se llama a `deleteOlderThan` (el test que protege
      el default de "no borrar nada sin que un admin lo pida")
- [ ] Con `auditLogRetentionDays: 90` → se llama con un cutoff de 90 días atrás (usá fake timers
      para que la fecha sea determinística)
- [ ] Con `deletedCount: 0` → no loguea
- [ ] Con `deletedCount > 0` → loguea en `info` con `deletedCount`
- [ ] Si `getSettings` rechaza, el tick rechaza y no deja la promesa sin manejar

---

## 5.4 Exponer el campo en el panel de admin

Sigue el patrón del resto de los campos de retención, que ya están en el panel.

Backend:
- `settings.validator.ts` — agregar `auditLogRetentionDays` al `updateSettingsSchema` (entero
  positivo o `null`)
- `settings.types.ts` — agregar al `UpdateSettingsInput`

Frontend:
- `features/admin/types/admin-settings.types.ts` — agregar el campo
- `AdminSettingsPanel.tsx` — agregar el input junto a `messageRetentionDays`, con un texto de ayuda
  que diga explícitamente qué implica: **vacío = se conserva para siempre**, y que bajar este valor
  **borra registros de auditoría de forma irreversible**. No es un límite más entre otros.

- [ ] Validator y tipos del backend actualizados
- [ ] Campo en el panel, agrupado con los otros de retención
- [ ] El texto de ayuda advierte que el borrado es irreversible

### Tests obligatorios

- [ ] `settings.validator.test.ts`: acepta un entero positivo y `null`; rechaza 0, negativos y no-enteros
- [ ] `settings.service.test.ts`: el cambio de este campo aparece en el diff de `UPDATE_SETTINGS`
      (o sea: **cambiar la política de retención de auditoría queda auditado**, que es lo mínimo
      que se le puede pedir)
- [ ] `AdminSettingsPanel.test.tsx`: renderiza el campo y lo envía en el submit

---

## 5.5 Verificación de la fase

```bash
npm run test --workspace=backend
```

En producción (o en un entorno que corra bajo PM2), después de `pm2 restart link-backend`:

```bash
pm2 logs link-backend --lines 20 --raw | head -5
```

- [ ] Cada línea del backend es JSON válido y **no** tiene un timestamp de PM2 adelante.
      Comprobalo de verdad: `pm2 logs link-backend --lines 50 --raw | jq -c . > /dev/null && echo OK`
- [ ] `pm2 conf pm2-logrotate` muestra `max_size`, `retain` y `compress` configurados
- [ ] Con `auditLogRetentionDays` en `null` (default), el worker no borra nada
- [ ] Los tests en verde

Commits sugeridos:
`fix(pm2): no prefijar timestamp al log JSON del backend`
`feat(backend): retencion configurable del audit trail`

Al cerrar: marcar la Fase 5 ✅ en [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5 y correr
`/graphify . --update`.
