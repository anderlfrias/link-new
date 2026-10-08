/// Roles conocidos dentro de `req.user.roles`, que salen de `User.roles`. En modo
/// local los asigna un admin (LOCAL_AUTH_PLAN.md, D8); con un proveedor externo
/// se sobrescriben en cada login con los que entregue el proveedor (solo los
/// conocidos, ver `filterKnownRoles`). Este único valor es, por ahora, el único
/// que le importa a la app (ver `settings` module y `requireRoles`).
export const ADMIN_ROLE = "admin";

/// Roles que la app conoce. Los demás roles de un proveedor externo se descartan:
/// no significan nada para LINK.
export const KNOWN_ROLES: readonly string[] = [ADMIN_ROLE];

export function filterKnownRoles(roles: readonly string[]): string[] {
  return Array.from(new Set(roles.filter((role) => KNOWN_ROLES.includes(role))));
}

/// Roles que un admin puede asignar en modo local.
export const ASSIGNABLE_LOCAL_ROLES: readonly string[] = [ADMIN_ROLE];
