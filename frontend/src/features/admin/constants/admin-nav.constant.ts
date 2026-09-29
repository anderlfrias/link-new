import { IconFiles, IconHistory, IconSettings, IconUsers, type TablerIcon } from "@tabler/icons-react";

export type AdminNavLabelKey = "settingsTab" | "filesTab" | "usersTab" | "auditTab";

export interface AdminNavItem {
  href: string;
  labelKey: AdminNavLabelKey;
  label: string;
  icon: TablerIcon;
}

/// Agregar una sección nueva = un objeto más acá + una `page.tsx` bajo
/// `frontend/src/app/(admin)/admin/` — el shell y el gate de rol ya cubren
/// cualquier ruta nueva dentro del grupo sin cambios adicionales.
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", labelKey: "settingsTab", label: "Configuración global", icon: IconSettings },
  { href: "/admin/files", labelKey: "filesTab", label: "Archivos", icon: IconFiles },
  { href: "/admin/users", labelKey: "usersTab", label: "Usuarios", icon: IconUsers },
  { href: "/admin/audit", labelKey: "auditTab", label: "Auditoría", icon: IconHistory },
];
