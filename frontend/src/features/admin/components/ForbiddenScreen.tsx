"use client";

import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

/** Se muestra en lugar de redirigir cuando un usuario autenticado pero sin
 * rol admin llega a /admin (link viejo, back del navegador, etc.) — mismo
 * estilo de banner inline que el resto de la app (ver ProfileSettingsPanel). */
export function ForbiddenScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <IconAlertCircle size={18} className="shrink-0" />
        <span>No tenés permisos para ver esta página.</span>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline"
      >
        <IconArrowLeft size={16} stroke={1.75} />
        Volver al chat
      </Link>
    </div>
  );
}
