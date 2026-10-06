/// Roles conocidos dentro de `req.user.roles`. De dónde salen depende del
/// modo de autenticación (LOCAL_AUTH_PLAN.md, D8): en modo external-auth, del arreglo
/// que EXTERNAL_AUTH embebe en su JWT (este backend solo los lee); en modo local, de
/// `User.localRoles`, que asigna un admin. Este único valor es, por ahora, el
/// único que le importa a la app (ver `settings` module y `requireRoles`).
export const ADMIN_ROLE = "admin";

/// Roles que un admin puede asignar en modo local.
export const ASSIGNABLE_LOCAL_ROLES: readonly string[] = [ADMIN_ROLE];
