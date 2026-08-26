import { IconFiles, IconSettings, type TablerIcon } from "@tabler/icons-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: TablerIcon;
}

/// Agregar una sección nueva = un objeto más acá + una `page.tsx` bajo
/// `frontend/src/app/(admin)/admin/` — el shell y el gate de rol ya cubren
/// cualquier ruta nueva dentro del grupo sin cambios adicionales.
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Configuración global", icon: IconSettings },
  { href: "/admin/files", label: "Archivos", icon: IconFiles },
];
