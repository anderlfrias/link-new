"use client";

import { useState } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { getAuditActionLabel } from "@/features/admin/constants/audit-action-labels.constant";
import { useTranslation } from "@/i18n";
import { useAuthConfig } from "@/providers/auth-config-provider";
import type { AdminAuditLogListItem } from "@/features/admin/types/admin-audit.types";

interface AdminAuditRowProps {
  item: AdminAuditLogListItem;
}

/** Acciones cuyo metadata trae `provider`: "local", o el id del proveedor externo. Las filas
 * anteriores al modo local no lo tienen: "ausente" significa un proveedor externo
 * (backend/src/modules/audit/audit.types.ts). */
const ACTIONS_WITH_PROVIDER = new Set(["LOGIN", "LOGIN_FAILED"]);

function metadataString(metadata: unknown, key: string): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function AdminAuditRow({ item }: AdminAuditRowProps) {
  const { t, locale } = useTranslation();
  const { config } = useAuthConfig();
  const [expanded, setExpanded] = useState(false);

  /** Traduce `key` o, si no hay traducción, muestra el valor crudo. */
  function translateOr(key: string, fallback: string): string {
    const translated = t(key);
    return translated !== key ? translated : fallback;
  }

  const actionLabel = translateOr(`admin.audit.actions.${item.action}`, getAuditActionLabel(item.action));

  // Proveedor, motivo y origen se muestran sin abrir el detalle: son lo primero
  // que mira un admin en un login fallido o en un cambio de cuenta.
  const providerId = ACTIONS_WITH_PROVIDER.has(item.action) ? (metadataString(item.metadata, "provider") ?? "external") : null;
  // El id de un proveedor externo se muestra con su nombre si es el de esta instalación.
  const provider =
    providerId === null
      ? null
      : providerId === config?.provider.id
        ? config.provider.displayName
        : translateOr(`admin.audit.providers.${providerId}`, providerId);
  const reason = metadataString(item.metadata, "reason");
  const via = metadataString(item.metadata, "via");
  const detailChips = [
    provider,
    reason && translateOr(`admin.audit.reasons.${reason}`, reason),
    via && translateOr(`admin.audit.via.${via}`, via),
  ].filter((chip): chip is string => Boolean(chip));

  const actorLabel = item.actor.name
    ? `${item.actor.name} · ${item.actor.email ?? ""}`
    : (item.actor.email ?? t("admin.audit.systemActor"));

  let resourceLabel = "—";
  if (item.conversationName) {
    resourceLabel = t("admin.audit.groupResource", { name: item.conversationName });
  } else if (item.conversationId) {
    resourceLabel = t("admin.audit.conversationResource", { id: item.conversationId.slice(0, 8) });
  } else if (item.targetType) {
    resourceLabel = `${item.targetType}${item.targetId ? ` (${item.targetId.slice(0, 8)}…)` : ""}`;
  }

  const hasMetadata = item.metadata !== undefined && item.metadata !== null;

  return (
    <div className="border-b border-black/5 px-2 py-3 last:border-0 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-xs font-semibold text-brand-blue dark:bg-brand-blue/20">
              {actionLabel}
            </span>
            {detailChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
              >
                {chip}
              </span>
            ))}
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {new Date(item.createdAt).toLocaleString(locale === "en" ? "en-US" : "es-AR")}
            </span>
          </div>
          <p className="mt-1 truncate font-medium text-brand-ink dark:text-white">
            {actorLabel}
          </p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {t("admin.audit.resource")}{" "}
            <span className="font-mono text-neutral-700 dark:text-neutral-300">{resourceLabel}</span>
            {item.ip && ` · IP: ${item.ip}`}
          </p>
        </div>

        {hasMetadata && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? t("admin.audit.hideDetails") : t("admin.audit.viewDetails")}
            className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span>{expanded ? t("admin.audit.hideDetails") : t("admin.audit.viewDetails")}</span>
            {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && hasMetadata && (
        <div className="mt-3 rounded-lg bg-neutral-100/70 p-3 text-xs dark:bg-neutral-900/60" data-testid="metadata-detail">
          <p className="mb-1 font-semibold text-neutral-700 dark:text-neutral-300">{t("admin.audit.metadata")}</p>
          <pre className="max-h-60 overflow-x-auto whitespace-pre-wrap break-all rounded bg-neutral-50 p-2 font-mono text-[11px] text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
            {JSON.stringify(item.metadata, null, 2)}
          </pre>
          {(item.userAgent || item.requestId) && (
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
              {item.requestId && <span>Request ID: {item.requestId}</span>}
              {item.userAgent && <span className="truncate max-w-md">UA: {item.userAgent}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
