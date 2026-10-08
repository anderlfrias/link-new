# Settings

Configuración global de la instalación (`AppSettings`, `prisma/schema.prisma`), editable en runtime por un usuario con rol `"admin"` — sin este módulo, los únicos límites de la app eran variables de entorno fijas al arrancar (`MAX_UPLOAD_SIZE_MB`) o reglas hardcodeadas en otros servicios (grupos).

Es una fila única ("singleton", `id: "singleton"`), no una tabla clave-valor: cada configuración es una columna tipada de `AppSettings`, garantizada por upsert-on-read (`settings.repository.ts`, `getOrCreate`) — no requiere ningún script de seed.

## Autorización

```
adminSettingsRouter.use(authenticate, attachInternalUser, requireRoles("admin"))
publicSettingsRouter.use(authenticate, attachInternalUser)
```

`requireRoles("admin")` (`src/middlewares/auth.middleware.ts`) exige que `"admin"` esté presente en `req.user.roles`. Los roles salen siempre de `User.roles`, que completa `attachInternalUser`. Qué los escribe depende del proveedor: con cuentas locales, un admin desde el panel de usuarios o el CLI; con un proveedor externo, cada login, a partir de los roles que entrega (solo los que la app conoce). Ver [`../auth/README.md`](../auth/README.md). Es la primera ruta de la app que usa este guard.

**Ajustes que dependen del proveedor de autenticación.** `localSessionTtlHours` (duración de la sesión de LINK; el nombre es histórico) rige con cualquier proveedor. Los de contraseñas y bloqueo (`passwordMinLength`, `passwordRequire*`, `passwordExpirationDays`, `passwordHistoryCount`, `maxFailedLoginAttempts`, `lockoutDurationMinutes`; `LOCAL_ACCOUNT_POLICY_FIELDS` en `settings.validator.ts`) solo tienen sentido con cuentas locales: con un proveedor externo, `PATCH /admin/settings` los rechaza con `400` y `code: "local_auth_setting_not_applicable"` (`settings.controller.ts`), en lugar de guardarlos sin que rijan nada.

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/api/v1/admin/settings` | admin | Configuración completa. |
| `PATCH` | `/api/v1/admin/settings` | admin | Actualiza uno o más campos (parcial). |
| `GET` | `/api/v1/settings/public` | cualquier autenticado | Subconjunto de solo lectura (`PublicAppSettingsDTO`): lo que un cliente necesita para validar antes de subir un archivo, grabar una nota de voz o crear un grupo, sin exponer el resto de la configuración administrativa. |

## Cache

`settings.service.ts` mantiene un cache en memoria de proceso (`getSettings()`), porque se consulta en cada mensaje/upload/operación de grupo — no vale la pena pegarle a la base en cada una. `updateSettings()` reemplaza el cache inmediatamente después de escribir (write-through), así que un cambio del admin aplica de inmediato para el resto de los requests en el mismo proceso. El cache es **por-proceso**: este backend corre siempre en un único proceso Node (ver `server.ts`), sin Redis ni otra infraestructura compartida — si el backend llega a escalar a más de un proceso/instancia, esto necesita revisarse (invalidación cross-proceso).

## Consumidores

| Campo | Quién lo consulta |
|---|---|
| `maxUploadSizeMb`, `fileTypeRestrictionMode`, `fileTypeList` | [`files`](../files/README.md), `file.service.ts` (`uploadFile`, `assertFileTypeAllowed`) y [`uploads`](../uploads/README.md) (`initiateUpload`, `completeUpload`). La restricción de tipos se aplica al tipo que declara el cliente **y** al real según los primeros bytes del archivo (ejecutables, ZIP y derivados, PDF, imágenes, audio, video y comprimidos más comunes). Los formatos de texto no tienen firma: para ellos sigue siendo declarativa. `maxUploadSizeMb` es el valor configurado: a los clientes se les informa el **efectivo** en `GET /settings/public` (sin almacenamiento S3 es como mucho 32 MB, el techo del camino directo; ver `getPublicSettings`). |
| `maxVoiceNoteDurationSeconds` | `files`, `file.service.ts` (`uploadFile`, cuando `kind === "voice_note"`) |
| `maxFilesPerMessage` | [`messages`](../messages/README.md), `message.service.ts` (`sendMessage`) — también en `PublicAppSettingsDTO`, para que el compositor frene la selección de archivos en el cliente antes de intentar subir de más |
| `maxGroupMembers`, `whoCanCreateGroups`, `whoCanAddMembers`, `whoCanRemoveMembers`, `whoCanChangeGroupInfo`, `whoCanDeleteGroup` | [`conversations`](../conversations/README.md), `conversation.service.ts` (`createConversation`, `addMembers`, `removeMember`, `updateConversation`, `deleteConversation`, vía `resolveEffectiveGroupSettings`) |
| `allowGroupOverrideAddMembers`, `allowGroupOverrideRemoveMembers`, `allowGroupOverrideMaxGroupMembers`, `allowGroupOverrideChangeGroupInfo`, `allowGroupOverrideDeleteGroup` | `settings.service.ts` (`resolveEffectiveGroupSettings`, `getGroupOverrideAllowedFlags`), consumidos por `conversations` vía `getGroupSettings`/`updateGroupSettings` |
| `messageRetentionDays` | `src/workers/message-retention.worker.ts` — al vencer, cada mensaje se borra igual que con "borrar para todos": se marca `deletedAt` y se descartan, de forma irreversible, su texto, su encuesta y la relación con sus archivos (los archivos huérfanos los libera el worker de limpieza si está activado). No hay opción para conservar el contenido: quien deba hacerlo (por ejemplo, por motivos legales) tiene que apagar `allowMessageDeleteForEveryone` y dejar `messageRetentionDays` en `null`. |
| `auditLogRetentionDays` | `src/workers/audit-retention.worker.ts` — retención en días del audit trail (`null` = conservar para siempre). Igual que el contenido de los mensajes borrados, el borrado de auditoría es físico e irreversible. |
| `allowMessageEdit`, `messageEditTimeLimitMinutes` | [`messages`](../messages/README.md), `message.service.ts` (`editMessage`) |
| `allowMessageDeleteForEveryone`, `messageDeleteForEveryoneTimeLimitMinutes` | [`messages`](../messages/README.md), `message.service.ts` (`deleteMessage`) — solo cuando el propio autor borra su mensaje, nunca cuando el creador de la conversación borra uno ajeno (moderación) |
| `allowConversationDelete` | [`conversations`](../conversations/README.md), `conversation.service.ts` (`deleteConversation`, rama `PRIVATE` — "Eliminar chat", borrado por-usuario vía `ConversationMember.hiddenAt`) |
| `allowGroupDelete` | `conversations`, `conversation.service.ts` (`deleteConversation`, rama `GROUP`) — interruptor maestro que se chequea antes de `whoCanDeleteGroup`; en `false` nadie puede borrar un grupo, sin excepción |
| `localSessionTtlHours` | Solo modo local. [`auth`](../auth/README.md#modo-local): `local-auth.service.ts` (duración del token que emite el login y el cambio de contraseña) e `identity.ts` (`resolveInternalUser` rechaza los tokens más viejos que el valor vigente) |
| `passwordMinLength`, `passwordRequireUppercase`, `passwordRequireLowercase`, `passwordRequireNumber`, `passwordRequireSymbol` | Solo modo local. `auth`, `local-auth.service.ts` (login: si la contraseña no cumple, token restringido con motivo `policy`; cambio de contraseña) y `GET /auth/config`. Se leen con `getLocalAuthPolicy()`, que aplica el piso de 8 caracteres |
| `passwordExpirationDays`, `passwordHistoryCount`, `maxFailedLoginAttempts`, `lockoutDurationMinutes` | Solo modo local. `auth`, `local-auth.service.ts`: vencimiento (token restringido con motivo `expired`), historial (`PATCH /auth/password`) y bloqueo por intentos fallidos en el login. `getLocalAuthPolicy()` aplica los topes (historial ≤ 12, bloqueo ≥ 3 intentos) |

Las 6 quedan también en `PublicAppSettingsDTO` (`GET /api/v1/settings/public`), a diferencia del resto de la configuración administrativa: el cliente las necesita para decidir si mostrar las acciones de editar/borrar sobre los propios mensajes, y eliminar chat/grupo, de quien esté logueado, aunque no sea admin — la autoridad real sigue siendo `message.service.ts`/`conversation.service.ts`, que las vuelven a chequear en cada `PATCH`/`DELETE`.

## Auditoría de cambios

Toda modificación de configuración (`updateSettings`) se ejecuta de manera atómica dentro de una transacción de Prisma (`prisma.$transaction`) junto con un registro en `AuditLog` bajo la acción `UPDATE_SETTINGS`. Se almacena un diff estricto con los valores previos y nuevos (`{ changed: { [campo]: { from, to } } }`), garantizando que cualquier cambio en límites o retención quede auditado.

## Overrides por grupo

Además de esta configuración global, cada `GROUP` puede tener su propio valor para 5 dimensiones (todas salvo `whoCanCreateGroups`), guardado en `ConversationGroupSettings` (1:1 opcional con `Conversation`, columnas nullable, dueño de la tabla es el módulo `conversations`) — pero **solo si** el `allowGroupOverride*` correspondiente de esta tabla está en `true`. `resolveEffectiveGroupSettings(override)` (este módulo) es la única función que debe leerse para esas 5 dimensiones: combina el override con el global respetando el flag, y nunca devuelve `null`. Ver [Overrides por grupo en `conversations`](../conversations/README.md#overrides-por-grupo) para el detalle completo y los endpoints.

## Compatibilidad con `MAX_UPLOAD_SIZE_MB`

La variable de entorno sigue existiendo (`src/config/env.ts`) solo como valor de creación de la fila singleton en el primer `getOrCreate()` — así el primer deploy de este módulo no pierde el límite que el operador ya tenía configurado. Después de esa primera lectura, la fila de `AppSettings` en la base es la única autoridad; el `.env` queda inerte para este propósito.
