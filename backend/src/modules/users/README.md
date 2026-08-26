# Users

Directorio de usuarios locales (`User`, `prisma/schema.prisma`) — perfil, no autenticación (eso es [`auth`](../auth/README.md)). Este módulo nunca crea usuarios por su cuenta: la fila de `User` la crea/actualiza `auth` (`upsertUserFromExternalUser`) al iniciar sesión o al sincronizar el directorio de la app.

## `GET /api/v1/users` — Directorio de contactos

```
router.use(authenticate, attachInternalUser)
```

Sin rol especial, cualquier autenticado. Antes de leer la base, sincroniza los usuarios de EXTERNAL_AUTH con acceso a esta app (`AuthService.syncAppUsers(token)`) — así el directorio incluye a cualquiera con acceso, no solo a quien ya inició sesión en este chat alguna vez. Si EXTERNAL_AUTH no responde, `syncAppUsers` nunca lanza: el directorio se sirve igual con lo que ya había local.

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

### Por qué esta vista no muestra el rol de cada usuario

Los roles vienen exclusivamente del JWT de EXTERNAL_AUTH, decodificado por request (`req.user.roles`) — **nunca se persisten** en `User` ni en ninguna otra tabla (ver [`auth/README.md`](../auth/README.md) y `constants/roles.constant.ts`). No existe ninguna llamada a EXTERNAL_AUTH en este backend que devuelva el rol de un usuario que no sea el que está haciendo el request (`getAppUsers`, usado por `syncAppUsers`, solo trae `id/email/username/fullName`, sin roles). Por lo tanto **es imposible mostrar "es admin" para un usuario que no sea el que está logueado en ese momento** — no es una omisión, es una restricción de la arquitectura de roles de esta app. Si en el futuro se necesita, requeriría que EXTERNAL_AUTH exponga un endpoint nuevo para consultar el rol de un tercero, o que este backend empiece a cachear roles al login (ninguna de las dos cosas existe hoy).

### Sobre `status`/`UserStatus.INACTIVE`

El campo existe en el schema pero **hoy ningún flujo de este backend lo pone en `INACTIVE`** — todo usuario nace y permanece `ACTIVE` (grep completo del backend: `status` solo se *lee*, en el filtro de `GET /` de arriba). Si en este panel todos los usuarios aparecen `ACTIVE`, no es un bug — es que todavía no existe ninguna acción (acá ni en ningún otro lado) que desactive a alguien.
