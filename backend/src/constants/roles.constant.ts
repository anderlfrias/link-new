/// Roles conocidos dentro de `req.user.roles` (arreglo que EXTERNAL_AUTH embebe en su
/// JWT, ver `../modules/auth/README.md`). Este backend no define ni asigna
/// roles — solo los lee — así que este único valor es, por ahora, el único
/// que le importa a la app (ver `settings` module y `requireRoles`).
export const ADMIN_ROLE = "admin";
