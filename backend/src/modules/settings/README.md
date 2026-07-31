# Settings

Configuración global de la instalación (`AppSettings`, `prisma/schema.prisma`), editable en runtime por un usuario con rol `"admin"` — sin este módulo, los únicos límites de la app eran variables de entorno fijas al arrancar (`MAX_UPLOAD_SIZE_MB`) o reglas hardcodeadas en otros servicios (grupos).

Es una fila única ("singleton", `id: "singleton"`), no una tabla clave-valor: cada configuración es una columna tipada de `AppSettings`, garantizada por upsert-on-read (`settings.repository.ts`, `getOrCreate`) — no requiere ningún script de seed.

## Autorización

```
adminSettingsRouter.use(authenticate, attachInternalUser, requireRoles("admin"))
publicSettingsRouter.use(authenticate, attachInternalUser)
```

`requireRoles("admin")` (`src/middlewares/auth.middleware.ts`) exige que `"admin"` esté presente en `req.user.roles` — el arreglo de roles que EXTERNAL_AUTH embebe en su JWT (ver [`../auth/README.md`](../auth/README.md)). Es la primera ruta de la app que usa este guard.

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
| `maxUploadSizeMb`, `fileTypeRestrictionMode`, `fileTypeList` | [`files`](../files/README.md), `file.service.ts` (`uploadFile`) |
| `maxVoiceNoteDurationSeconds` | `files`, `file.service.ts` (`uploadFile`, cuando `kind === "voice_note"`) |
| `maxGroupMembers`, `whoCanCreateGroups`, `whoCanAddMembers`, `whoCanRemoveMembers` | [`conversations`](../conversations/README.md), `conversation.service.ts` (`createConversation`, `addMembers`, `removeMember`) |
| `messageRetentionDays` | `src/workers/message-retention.worker.ts` |

## Compatibilidad con `MAX_UPLOAD_SIZE_MB`

La variable de entorno sigue existiendo (`src/config/env.ts`) solo como valor de creación de la fila singleton en el primer `getOrCreate()` — así el primer deploy de este módulo no pierde el límite que el operador ya tenía configurado. Después de esa primera lectura, la fila de `AppSettings` en la base es la única autoridad; el `.env` queda inerte para este propósito.
