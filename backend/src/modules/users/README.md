# Users

Directorio de usuarios locales (`User`, `prisma/schema.prisma`) — perfil, no autenticación (eso es [`auth`](../auth/README.md)) — y administración de cuentas desde el panel. Quién crea las filas de `User` depende del modo ([LOCAL_AUTH_PLAN.md](../../../../docs/design/LOCAL_AUTH_PLAN.md)): en modo external-auth las crea/actualiza `auth` (`upsertUserFromExternalUser`) al iniciar sesión o al sincronizar el directorio de la app; en modo local las crea un admin, desde este módulo o con el CLI (`src/cli/auth-admin.ts`).

## `GET /api/v1/users` — Directorio de contactos

```
router.use(authenticate, attachInternalUser)
```

Sin rol especial, cualquier autenticado. Es una **lectura pura de la tabla `User`**: no llama a ningún proveedor externo ni usa el token de la request. Con un proveedor externo, el directorio se mantiene al día al iniciar sesión: el `onLogin` del proveedor (ver [`auth`](../auth/README.md#proveedores-de-autenticación)) lo sincroniza en segundo plano, con throttle (a lo sumo una vez cada 10 minutos en todo el proceso, y sin consumir la ventana si el proveedor no respondió): trae los usuarios con acceso a esta app y los guarda — así el directorio incluye a cualquiera con acceso, no solo a quien ya inició sesión en este chat alguna vez. Con cuentas locales el directorio es la tabla `User`.

Query param opcional: `search` (contains, case-insensitive, contra `name`/`email`). Devuelve un array (sin paginación, `take: 100` fijo — en la práctica el directorio de una empresa es chico), **excluye al propio usuario** y **fuerza `status: ACTIVE`** — está pensado exclusivamente para el selector de contactos al iniciar una conversación, no para administración. Cada entrada: `{ id, name, email, avatarFileId, avatarFile: { path } | null, status }`.

## Gestión de usuarios (admin)

```
adminUserRouter.use(authenticate, attachInternalUser, requireRoles("admin"))
```

Base: `/api/v1/admin/users`, requiere rol `"admin"`. A diferencia de `GET /`, muestra **todos** los usuarios (incluido el propio admin, sin filtrar `status`) más cuánto almacenamiento usa cada uno y su actividad — es la vista de "quién es quién en la instalación", no un selector de contactos.

### `GET /` — Listar usuarios

Query params, todos opcionales: `before` (cursor por id), `limit` (default 30, máx 100), `search` (contains, case-insensitive, contra `name`/`email`/`username`).

```json
{
  "users": [
    {
      "id": "user-uuid", "name": "Ana", "email": "ana@x.com", "username": "ana.external-auth",
      "avatarFileId": "file-uuid", "avatarFile": { "path": "avatars/..." },
      "status": "ACTIVE", "syncProfileWithIntegration": true, "createdAt": "...",
      "storage": { "fileCount": 12, "totalSize": 4582001 },
      "activity": { "conversationCount": 8, "messagesSentCount": 340, "groupsAdministeredCount": 1 }
    }
  ],
  "totalCount": 57
}
```

- `storage` — archivos activos (`deletedAt: null`) subidos por ese usuario, agregados solo para los ids de la página actual (`StoredFile.groupBy` por `createdById`), igual de barato que el resto de las queries paginadas de este backend.
- `activity.conversationCount`/`messagesSentCount` — conteos directos de las relaciones `conversationMemberships`/`sentMessages` de `User` (Prisma `_count`, sin N+1).
- `activity.groupsAdministeredCount` — cuántos `GROUP` tiene con `ConversationMember.isAdmin: true` (ver [`conversations/README.md#admins-de-grupo`](../conversations/README.md#admins-de-grupo)), no cuántos creó — un admin de grupo no tiene por qué ser el creador.
- `syncProfileWithIntegration` — si el nombre/foto de este usuario todavía se actualiza solo desde EXTERNAL_AUTH, o si ya fue editado localmente (`auth.repository.ts`, `setLocalName`/`setLocalAvatar`) y dejó de sincronizarse.

Filtros adicionales: `status` (`ACTIVE` o `INACTIVE`, los dos modos) y `hasPassword` (`true` o `false`, solo modo local: cuentas con o sin contraseña asignada, útil después de migrar desde EXTERNAL_AUTH). En modo local cada fila suma `localRoles`, `hasPassword`, `mustChangePassword` y `locked`; nunca el hash ni nada de la contraseña.

### Roles en cada modo

- **Modo external-auth:** los roles se guardan en `User.roles` en cada login, a partir del JWT de EXTERNAL_AUTH (solo los que la app conoce, hoy `"admin"`), y de ahí se leen en cada request. Es lo que EXTERNAL_AUTH dijo la última vez que esa persona inició sesión: no hay ninguna llamada a EXTERNAL_AUTH que devuelva el rol de un tercero (`getAppUsers`, usado por `syncAppUsers`, solo trae `id/email/username/fullName`), así que quien nunca inició sesión acá no tiene roles. Se administran en EXTERNAL_AUTH: el panel no los edita.
- **Modo local:** la app asigna los roles (`User.roles`, hoy solo `"admin"`), así que el panel los muestra y un admin los edita. En la API se siguen llamando `localRoles`.

### Desactivar cuentas (`status`)

`UserStatus.INACTIVE` corta el acceso de una cuenta al chat en los dos modos ([LOCAL_AUTH_PLAN.md](../../../../docs/design/LOCAL_AUTH_PLAN.md), D19). En modo external-auth, una cuenta desactivada no entra aunque EXTERNAL_AUTH acepte su contraseña (`403 account_disabled`), y `syncAppUsers` nunca la reactiva. Sus tokens vigentes se rechazan (`resolveInternalUser`) y sus sockets se cortan en el momento. Las cuentas nunca se borran: borrar rompería las relaciones de mensajes y auditoría. El directorio (`GET /`) ya filtra `status: ACTIVE`, así que una cuenta desactivada desaparece del selector de contactos.

### `PATCH /:id` — Editar una cuenta (los dos modos)

- **Modo external-auth:** `{ status }`. Los datos de la cuenta los administra EXTERNAL_AUTH; desde acá solo se activa o desactiva su acceso al chat.
- **Modo local:** `{ name?, email?, username?, roles?, status? }`. Email en minúsculas; username opcional, de 3 a 32 caracteres `a-z 0-9 . _`, sin "@" (un string vacío o `null` lo quita).

Reglas: nadie puede desactivarse ni quitarse el rol de admin a sí mismo (`409 cannot_modify_self`), y en modo local la instalación nunca se queda sin un admin activo (`409 last_admin`). Email o username en uso por otra cuenta: `409 email_taken` / `username_taken`, sin distinguir mayúsculas. Desactivar corta los sockets de la cuenta y, en modo local, revoca sus tokens. Cada cambio se audita como `UPDATE_USER` (`{ via: "panel", changed }`) en la misma transacción.

### Solo modo local (`404` en external-auth)

| Método y ruta | Body | Respuesta |
|---|---|---|
| `POST /` | `{ name, email, username?, roles?, password? }` | `201 { user, temporaryPassword? }`. Sin `password` se genera una temporal, que se devuelve **una sola vez**. Con o sin ella, la cuenta queda con el cambio obligatorio. Auditoría `CREATE_USER`. |
| `POST /:id/password-reset` | `{ password? }` | `200 { temporaryPassword? }`. Deja el cambio obligatorio, desbloquea la cuenta, revoca sus tokens y corta sus sockets. También le da contraseña a una cuenta que no tenía. Auditoría `RESET_PASSWORD`. |
| `POST /:id/unlock` | — | `204`. Reinicia el contador de intentos fallidos; si estaba bloqueada, se audita `UPDATE_USER` con `locked`. |

Una contraseña elegida por el admin tiene que cumplir la política vigente (`400 password_policy`); la generada la cumple siempre. La lógica vive en `account-admin.service.ts`: lee, decide y escribe en una transacción interactiva, así dos admins simultáneos no pueden dejar la instalación sin admin.

### CLI: primer admin y emergencias (modo local)

```bash
npm run auth:admin -- create-admin --email <correo> [--name <nombre>] [--username <usuario>]
npm run auth:admin -- reset-password --email <correo>
```

`auth:admin` corre el build (`dist/`); en desarrollo, sin compilar, `auth:admin:dev`. Con Docker: `docker compose exec backend npm run auth:admin -- create-admin --email <correo>`. `create-admin` crea la cuenta o, si ya hay una con ese correo (por ejemplo de la época EXTERNAL_AUTH), le da credencial y rol admin conservando su historial. La contraseña temporal sale **una sola vez** por la terminal, nunca por el logger. Se audita con `via: "cli"`. Se niega a correr en modo external-auth.
