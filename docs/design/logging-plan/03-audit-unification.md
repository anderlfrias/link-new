# Fase 3 — Unificar y extender el audit trail

**Prerrequisitos:** Fases 0, 1 y 2 cerradas. En particular el `RequestMeta` de la Fase 1: esta
fase saca de ahí `ip`, `userAgent`, `requestId` y `actorUserId`, y por eso **no cambia la firma de
ningún service existente**.
**Deja andando:** una sola tabla de auditoría, con contexto de petición, que cubre además el login
y las acciones de admin.
**No hace:** exponerla para lectura (Fase 4) ni retención (Fase 5).

Leé antes: [LOGGING_PLAN.md](../LOGGING_PLAN.md) §3 (la fila "Tabla de auditoría" y la de
"Escritura de auditoría") y §4 (privacidad — esta fase es donde más aplica).

---

## 3.0 Qué ya existe (no lo rehagas)

`ChatAuditLog` **ya está en el schema y ya se escribe** desde 10 lugares:

| Archivo | Acciones |
|---|---|
| `modules/conversations/conversation.service.ts` | `CREATE_CONVERSATION` (×2, L170 y L213), `CHANGE_NAME` (L308), `CHANGE_IMAGE` (L316), `ADD_MEMBER` (L366), `REMOVE_MEMBER` (L420), `SET_GROUP_ADMIN` (L525) |
| `modules/messages/message.service.ts` | `SEND_MESSAGE` (L256), `FORWARD_MESSAGE` (L287), `EDIT_MESSAGE` (L360), `DELETE_MESSAGE` (L403) |

Con un helper `logAudit()` **duplicado** en `conversation.repository.ts:257` y
`message.repository.ts:149`.

Tu trabajo no es inventar un audit trail: es unificar esos dos helpers en un módulo, darle contexto
de petición a las filas, y cubrir los tres agujeros (login, settings de admin, borrado admin de
archivos).

---

## 3.1 Cambios de schema

Todos los cambios son **no destructivos** y compatibles con `prisma db push` (el repo no usa
migraciones versionadas — ver el script `prisma:sync`). La tabla física **no se renombra**: se
conserva `@@map("chat_audit_logs")` y el `@@map("chat_audit_action")` del enum, así que no hay
migración de datos.

En `backend/prisma/schema.prisma`:

### El enum

Renombrar `ChatAuditAction` → `AuditAction` conservando su `@@map`, y agregar los valores nuevos:

```prisma
/// Acciones registradas en el audit trail (ver src/modules/audit/README.md).
/// El @@map conserva el nombre físico original del tipo en Postgres: renombrar
/// el modelo en Prisma no toca la base.
enum AuditAction {
  CREATE_CONVERSATION @map("create_conversation")
  ADD_MEMBER          @map("add_member")
  REMOVE_MEMBER       @map("remove_member")
  SEND_MESSAGE        @map("send_message")
  FORWARD_MESSAGE     @map("forward_message")
  EDIT_MESSAGE        @map("edit_message")
  DELETE_MESSAGE      @map("delete_message")
  CHANGE_NAME         @map("change_name")
  CHANGE_IMAGE        @map("change_image")
  SET_GROUP_ADMIN     @map("set_group_admin")

  /// Autenticación. No existe LOGOUT a propósito: el JWT del proveedor externo es stateless
  /// y el logout ocurre enteramente en el cliente (descarta el token) — el
  /// backend no lo observa. Auditar un evento que no se puede detectar daría un
  /// trail con huecos que parecen datos.
  LOGIN               @map("login")
  LOGIN_FAILED        @map("login_failed")

  /// Acciones de administración de la instalación.
  UPDATE_SETTINGS     @map("update_settings")
  ADMIN_DELETE_FILE   @map("admin_delete_file")

  @@map("chat_audit_action")
}
```

### El modelo

```prisma
model AuditLog {
  id String @id @default(uuid())

  /// Nullable desde que se auditan los intentos de login fallidos: en un
  /// LOGIN_FAILED puede no haber ningún `User` local al que apuntar (usuario
  /// inexistente, o que nunca entró a esta app). `actorEmail` guarda entonces
  /// la identidad que se intentó usar.
  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id])

  /// Identidad tal como la presentó el actor. Se guarda SIEMPRE, incluso con
  /// `userId` presente: un audit trail tiene que seguir siendo legible aunque
  /// ese `User` cambie de email más adelante.
  actorEmail String? @map("actor_email")

  conversationId String?       @map("conversation_id")
  conversation   Conversation? @relation(fields: [conversationId], references: [id])

  messageId String?  @map("message_id")
  message   Message? @relation(fields: [messageId], references: [id])

  /// Recurso afectado cuando no es una conversación ni un mensaje: un
  /// `StoredFile`, la fila singleton de `AppSettings`, etc. Par genérico a
  /// propósito — una FK por cada tipo auditable obligaría a tocar este modelo
  /// con cada feature nueva.
  targetType String? @map("target_type")
  targetId   String? @map("target_id")

  action   AuditAction
  /// Datos adicionales de la acción. **Esquema cerrado**, documentado y tipado
  /// en `src/modules/audit/audit.types.ts` — NUNCA contenido de mensajes
  /// (LOGGING_PLAN.md §4.1 y §4.6).
  metadata Json?

  /// Contexto de la petición. `ip` es el visitante real y no Cloudflare gracias
  /// a `app.set("trust proxy", 1)` (ver app.ts). `requestId` ata esta fila al
  /// log de aplicación de la misma request.
  ip        String? @map("ip")
  userAgent String? @map("user_agent")
  requestId String? @map("request_id")

  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([conversationId])
  @@index([messageId])
  /// Filtro del panel de admin (Fase 4): "todas las acciones X, más recientes primero".
  @@index([action, createdAt])
  /// Orden por defecto del listado y barrido del worker de retención (Fase 5).
  @@index([createdAt])
  @@map("chat_audit_logs")
}
```

Y las tres back-relations (`schema.prisma` líneas ~194 en `User`, ~235 en `Conversation`, ~350 en
`Message`) pasan de `auditLogs ChatAuditLog[]` a `auditLogs AuditLog[]`.

### Aplicar

```bash
npm run prisma:sync --workspace=backend
```

> **Leé el plan que imprime `db push` antes de aceptarlo.** Debería listar: agregar 5 columnas
> nullables, quitar el `NOT NULL` de `user_id`, agregar 4 valores al enum y crear 2 índices.
> Si menciona **borrar** o **recrear** la tabla `chat_audit_logs`, pará: algo del `@@map` quedó mal
> escrito, y aceptarlo destruiría el audit trail existente.

- [x] Enum renombrado a `AuditAction` con `@@map("chat_audit_action")` intacto y 4 valores nuevos
- [x] Modelo renombrado a `AuditLog` con `@@map("chat_audit_logs")` intacto
- [x] `userId` nullable; `actorEmail`, `targetType`, `targetId`, `ip`, `userAgent`, `requestId` agregados
- [x] 2 índices nuevos
- [x] Las 3 back-relations actualizadas
- [x] `db push` aplicado y su plan revisado (sin drops)
- [x] `npm run build --workspace=backend` compila (el rename rompe los ~28 imports de
      `ChatAuditAction` — corregirlos es parte de §3.3)

---

## 3.2 El módulo `backend/src/modules/audit/` (nuevo)

Sigue la estructura de los otros módulos del repo (`*.types.ts`, `*.repository.ts`,
`*.service.ts`, `README.md`). Sin controller ni route todavía — eso es Fase 4.

### `audit.types.ts` — el contrato de `metadata`

Esta es la pieza que hace cumplir la regla de privacidad por tipos y no por disciplina: el
`metadata` de cada acción tiene una forma declarada, y el compilador rechaza cualquier otra.

```ts
import { ConversationType, FileProvider, MessageType } from "@prisma/client";

/// Forma del `metadata` de cada acción. `undefined` significa "esta acción no
/// lleva metadata" — y es distinto de `Record<string, unknown>`: dejarlo
/// abierto es justamente la vía por la que termina entrando contenido privado
/// sin que nadie lo decida (LOGGING_PLAN.md §2.2 problema 8).
///
/// REGLA: ninguna entrada de este mapa puede contener texto escrito por un
/// usuario dentro de un mensaje. Ver EDIT_MESSAGE.
export type AuditMetadataMap = {
  CREATE_CONVERSATION: { conversationType: ConversationType };
  ADD_MEMBER: { memberId: string };
  REMOVE_MEMBER: { memberId: string };
  SET_GROUP_ADMIN: { memberId: string; isAdmin: boolean };
  /// Nombre e imagen de un GRUPO: no son contenido de mensajes, son metadata
  /// visible para todos sus miembros. El "de qué a qué" es el valor del rastro.
  CHANGE_NAME: { from: string | null; to: string | null };
  CHANGE_IMAGE: { from: string | null; to: string | null };
  SEND_MESSAGE: { messageType: MessageType; fileCount: number };
  FORWARD_MESSAGE: { fromConversationId: string };
  /// SIN metadata, a propósito y para siempre. Guardar el contenido anterior y
  /// el nuevo sería meter texto de conversaciones privadas en una tabla que los
  /// admins pueden leer (LOGGING_PLAN.md §4.1). Que un mensaje fue editado, por
  /// quién y cuándo, ya es todo el rastro que corresponde.
  EDIT_MESSAGE: undefined;
  DELETE_MESSAGE: { deletedOwnMessage: boolean };

  LOGIN: undefined;
  /// El motivo tal como el backend REALMENTE lo puede distinguir. Ojo:
  /// `forbidden_by_provider` no significa "contraseña incorrecta" — el proveedor externo
  /// devuelve 403 tanto para credenciales inválidas como para falta de acceso a
  /// la app, y no se pueden separar (ver el comentario en auth.service.ts).
  /// Nombrarlo "invalid_credentials" sería registrar una conclusión que el
  /// sistema no tiene.
  LOGIN_FAILED: {
    reason: "forbidden_by_provider" | "invalid_credentials" | "provider_error" | "provider_unreachable";
  };
  /// El diff de la configuración global. `AppSettings` no tiene ningún campo
  /// secreto (son límites y flags), así que diffear todo lo que cambió es
  /// seguro — verificalo si alguna vez se agrega un campo con un secreto ahí.
  UPDATE_SETTINGS: { changed: Record<string, { from: unknown; to: unknown }> };
  /// El nombre original del archivo NO va acá: la fila de `StoredFile` nunca se
  /// borra (solo se marca `deletedAt`, ver file.service.ts#adminDeleteFile), así
  /// que quien audite puede resolver el nombre por `targetId`. Duplicarlo en una
  /// tabla con otra política de retención sería filtrarlo dos veces
  /// (LOGGING_PLAN.md §4.5).
  ADMIN_DELETE_FILE: { provider: FileProvider; sizeBytes: number; mimeType: string };
};
```

### `audit.repository.ts`

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

/// Devuelve la operación SIN ejecutar (`PrismaPromise`), para poder incluirla en
/// un `prisma.$transaction([...])` junto al efecto que audita — ver §3.5.
export function createOperation(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}

/// Vía normal: la ejecuta de una.
export function create(data: Prisma.AuditLogUncheckedCreateInput) {
  return createOperation(data);
}
```

### `audit.service.ts`

```ts
import { AuditAction, Prisma } from "@prisma/client";
import { getLogger, getRequestMeta } from "../../config/request-context";
import * as AuditRepository from "./audit.repository";
import { AuditMetadataMap } from "./audit.types";

export type RecordParams<A extends AuditAction> = {
  action: A;
  /// Default: el `actorUserId` del contexto de la petición. Explícito solo
  /// cuando el actor no es quien hizo la request (o no hay request).
  userId?: string | null;
  actorEmail?: string | null;
  conversationId?: string;
  messageId?: string;
  targetType?: string;
  targetId?: string;
} & (AuditMetadataMap[A] extends undefined
  ? { metadata?: undefined }
  : { metadata: AuditMetadataMap[A] });

/// Arma la fila completando el contexto de la petición (IP, user-agent,
/// requestId, actor). Separada de `record` para que la variante transaccional
/// de §3.5 reuse exactamente la misma lógica.
export function buildAuditData<A extends AuditAction>(
  params: RecordParams<A>,
): Prisma.AuditLogUncheckedCreateInput {
  const meta = getRequestMeta();
  return {
    action: params.action,
    userId: params.userId ?? meta.actorUserId ?? null,
    actorEmail: params.actorEmail ?? meta.actorEmail ?? null,
    conversationId: params.conversationId,
    messageId: params.messageId,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  };
}

/// Registra una acción. **Nunca tira.**
///
/// El motivo: se llama DESPUÉS del write primario, que ya se commiteó. Si esto
/// tirara, el usuario vería un 500 sobre una acción que sí se ejecutó — el peor
/// de los dos mundos, y es el comportamiento que tiene el repo hoy con
/// `await logAudit(...)`. Perder una fila de auditoría es un problema, así que
/// no se traga en silencio: se loguea en `error` para que sea visible y
/// alertable.
///
/// Las acciones donde perder el rastro es inaceptable (las de admin) NO usan
/// esta función: van en la misma transacción que su efecto, ver §3.5.
export async function record<A extends AuditAction>(params: RecordParams<A>): Promise<void> {
  try {
    await AuditRepository.create(buildAuditData(params));
  } catch (err) {
    getLogger().error({ err, action: params.action }, "failed to write audit log");
  }
}
```

### `README.md` del módulo

Siguiendo la convención de los otros `modules/*/README.md`. Tiene que decir, como mínimo:
- Que esta tabla es el audit trail de cumplimiento y **no** el log de aplicación (con el link a
  LOGGING_PLAN.md §3).
- La tabla de acciones con el `metadata` de cada una.
- Que el nombre físico `chat_audit_logs` es histórico y por qué se conserva.
- Que agregar una acción nueva es: valor en el enum + entrada en `AuditMetadataMap` + fila en la
  tabla de este README. Los tres, no dos.

- [x] `audit.types.ts` con el `AuditMetadataMap` completo y sus comentarios de por qué
- [x] `audit.repository.ts` con `create` y `createOperation`
- [x] `audit.service.ts` con `buildAuditData` y `record`
- [x] `README.md` del módulo

### Tests obligatorios — `audit.service.test.ts`

- [x] `buildAuditData` completa `ip`, `userAgent`, `requestId` y `userId` desde el contexto
      (correlo dentro de un `runWithContext` con un meta armado)
- [x] Un `userId` explícito **gana** sobre el del contexto
- [x] Fuera de todo contexto, `buildAuditData` no tira y deja esos campos `undefined`/`null`
- [x] `record` llama al repositorio una vez con los datos armados
- [x] **`record` NO tira si el repositorio rechaza** — y logueó en `error` (este es el test que
      justifica el diseño; si falla, una caída de la base al auditar rompe el chat)
- [x] Una acción con `metadata: undefined` declarado (`EDIT_MESSAGE`) guarda `metadata` nulo
- [x] TypeScript rechaza `metadata` de la forma equivocada para una acción (verificalo a mano con
      un `// @ts-expect-error` en el test: si compila, el contrato no está haciendo nada)

---

## 3.3 Migrar los call sites existentes

1. Borrar `logAudit` de `conversation.repository.ts` (L257) y de `message.repository.ts` (L149).
2. En `conversation.service.ts` y `message.service.ts`, reemplazar cada
   `await XRepository.logAudit({...})` por `await AuditService.record({...})`.
3. Corregir los imports de `ChatAuditAction` → `AuditAction` (~28 referencias, incluidos tests).
4. Completar el `metadata` que el contrato ahora exige y que hoy falta: `CREATE_CONVERSATION`
   necesita `conversationType`, `SEND_MESSAGE` necesita `messageType` y `fileCount`,
   `ADD_MEMBER`/`REMOVE_MEMBER` necesitan `memberId`, `SET_GROUP_ADMIN` necesita
   `memberId`/`isAdmin`, `FORWARD_MESSAGE` necesita `fromConversationId`. Todos esos datos ya están
   disponibles en el scope de cada función — el compilador te va a señalar uno por uno.
5. `CHANGE_NAME` y `CHANGE_IMAGE` ya pasan `{ from, to }`: coinciden con el contrato, no los toques.
6. `DELETE_MESSAGE` ya pasa `{ deletedOwnMessage }`: ídem.

> **Cambio de comportamiento a tener presente:** antes, si la escritura de auditoría fallaba, el
> request fallaba con 500. Ahora no. Es intencional (ver el comentario de `record`), pero es un
> cambio observable: los tests existentes que asumían la propagación del error hay que
> actualizarlos, no borrarlos.

- [x] Los dos `logAudit` duplicados eliminados
- [x] Las 11 llamadas migradas a `AuditService.record`
- [x] Todos los `ChatAuditAction` renombrados
- [x] `metadata` completado donde el contrato lo exige
- [x] `npm run test --workspace=backend` en verde con los tests existentes de
      `conversation.service.test.ts` y `message.service.test.ts` **actualizados** (ya assertean
      sobre `logAudit`: ahora deben assertear sobre `AuditService.record`)
- [x] Un test nuevo verifica que **una acción de chat sigue funcionando si la auditoría falla**
      (ej. `createConversation` devuelve la conversación aunque `record` no pueda escribir)

---

## 3.4 🔴 Auditar el login

Hoy no queda rastro de quién entró ni desde dónde. El rate limiter de `/login`
(`loginIpRateLimiter` 20/15min por IP + `loginUserRateLimiter` 5/15min por usuario, ya en
`auth.route.ts`) es lo que acota el volumen de filas `LOGIN_FAILED`, así que no hace falta un
mecanismo nuevo para eso.

**Importante:** el login **no** pasa por `attachInternalUser`, así que el contexto **no** tiene
`actorUserId` ni `actorEmail`. Hay que pasarlos explícitos.

En `auth.controller.ts#login`, después del `upsertUsuario` (que es donde por fin se conoce el id
interno):

```ts
    const internalUser = await AuthService.upsertUsuario(mappedUser);

    void AuditService.record({
      action: AuditAction.LOGIN,
      userId: internalUser.id,
      actorEmail: mappedUser.email,
    });
```

Y en el `catch`, antes de `next(error)`:

```ts
  } catch (error) {
    // El intento fallido se registra con la identidad INTENTADA y sin userId:
    // puede no existir ningún User local para ese usuario (ver el comentario de
    // `userId` en el schema). `record` nunca tira, así que esto no puede
    // enmascarar el error original que se propaga abajo.
    void AuditService.record({
      action: AuditAction.LOGIN_FAILED,
      userId: null,
      actorEmail: typeof req.body?.user === "string" ? req.body.user : null,
      metadata: { reason: mapLoginFailureReason(error) },
    });
    next(error);
  }
```

El mapeo tiene que reflejar lo que `auth.service.ts#login` realmente tira, sin inventar precisión:

| Error que tira `login()` | `reason` | Por qué ese nombre |
|---|---|---|
| `ForbiddenError` (status 403, o `/forbidden/` en el body) | `forbidden_by_provider` | El proveedor externo usa 403 para credenciales inválidas **y** para falta de acceso a la app, sin distinguir. El comentario de `auth.service.ts` lo dice explícitamente: registrar `invalid_credentials` acá sería afirmar algo que el sistema no sabe. |
| `UnauthorizedError` (status 401, o `!data.success`/`!data.token`) | `invalid_credentials` | Acá el proveedor externo sí afirma credenciales incorrectas |
| `ServiceUnavailableError` por `!response.ok` | `provider_error` | El proveedor externo respondió, pero con un status inesperado |
| `ServiceUnavailableError` por el `fetch` que tira (timeout/red) | `provider_unreachable` | No hubo respuesta |
| `BadRequestError` (falta usuario o contraseña) | **no se audita** | No es un intento de autenticación, es una request mal formada |

> Las dos últimas comparten la clase `ServiceUnavailableError`. Distinguirlas exige que
> `auth.service.ts` lo señale — la forma más limpia es una propiedad en el error o dos subclases.
> Si te resulta desproporcionado, usá `provider_error` para ambas y **anotalo en el README del
> módulo**; lo que no vale es adivinar.

- [x] `LOGIN` registrado con `userId` y `actorEmail` explícitos
- [x] `LOGIN_FAILED` registrado en el `catch`, con `userId: null` y la identidad intentada
- [x] `BadRequestError` (campos faltantes) **no** genera fila
- [x] Se registran `ip` y `userAgent` (vienen del contexto, no hay que pasarlos)

### Tests obligatorios — extender `auth.controller.test.ts`

- [x] Login exitoso → una fila `LOGIN` con el `userId` interno y el email
- [x] 403 del proveedor externo → una fila `LOGIN_FAILED` con `reason: "forbidden_by_provider"` y `userId: null`
- [x] 401 del proveedor externo → `reason: "invalid_credentials"`
- [x] `fetch` que tira → `reason: "provider_unreachable"` (o el que hayas documentado)
- [x] Request sin usuario/contraseña → **ninguna** fila de auditoría
- [x] **El error original se sigue propagando** al cliente con el mismo status y mensaje que antes
- [x] La contraseña **no** aparece en ningún campo de la fila (asserteá sobre el objeto completo)

---

## 3.5 🔴 Auditar las acciones de admin (en transacción)

Estas dos son las de mayor valor de auditoría del sistema y las únicas que **no** usan
`record()`: van en la misma transacción que su efecto, así que o quedan las dos o ninguna. Ver la
fila "Escritura de auditoría" de LOGGING_PLAN.md §3.1.

La forma de array de `$transaction` alcanza porque los repositorios involucrados devuelven la
`PrismaPromise` sin `await` (verificado: `settings.repository.ts#update` y
`file.repository.ts#softDelete`).

### `PATCH /v1/admin/settings`

En `settings.service.ts#updateSettings`:

```ts
export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
  const before = await getSettings();
  const changed = diffSettings(before, input);

  // Una PATCH que no cambia nada no genera rastro: una fila de auditoría vacía
  // solo agrega ruido a la revisión.
  if (Object.keys(changed).length === 0) {
    return before;
  }

  // Efecto y rastro en la misma transacción: que la configuración global de la
  // instalación pueda cambiar sin dejar constancia de quién la cambió es el
  // agujero que esta fase cierra (LOGGING_PLAN.md §2.2 problema 2).
  const [updated] = await prisma.$transaction([
    SettingsRepository.update(input),
    AuditRepository.createOperation(
      AuditService.buildAuditData({
        action: AuditAction.UPDATE_SETTINGS,
        targetType: "AppSettings",
        targetId: SETTINGS_ID,
        metadata: { changed },
      }),
    ),
  ]);

  // El cache de módulo se refresca recién acá: si la transacción falla, el
  // cache tiene que seguir reflejando lo que hay en la base.
  cached = updated;
  return updated;
}
```

`diffSettings(before, input)` compara **solo las claves presentes en `input`** y devuelve
`{ campo: { from, to } }` únicamente para las que realmente cambiaron. Ponela en `settings.service.ts`
y exportala para poder testearla directo.

### `DELETE /v1/admin/files/:id`

En `file.service.ts#adminDeleteFile`, reemplazar el `await FileRepository.softDelete(fileId)` final:

```ts
  const [deleted] = await prisma.$transaction([
    FileRepository.softDelete(fileId),
    AuditRepository.createOperation(
      AuditService.buildAuditData({
        action: AuditAction.ADMIN_DELETE_FILE,
        targetType: "StoredFile",
        targetId: fileId,
        metadata: { provider: file.provider, sizeBytes: Number(file.size), mimeType: file.mimeType },
      }),
    ),
  ]);
```

Dos detalles:
- El borrado de los **bytes físicos** sigue ocurriendo antes y fuera de la transacción: no es
  transaccionable (es una llamada al storage). El `try/catch` que ya está ahí, con su comentario, no
  se toca.
- `StoredFile.size` es `BigInt` en el schema (verificado), así que el `Number()` **es obligatorio**:
  un `BigInt` no es serializable a JSON y tirar en `JSON.stringify` es exactamente el modo de falla
  que documenta "Riesgo 3 — Fallos de serialización de BigInt en runtime" de `LARGE_FILES_PLAN.md`.
  Leé esa nota antes de tocar esto.
- El campo del nombre de archivo se llama `originalName` — es el que **no** va en el `metadata`.

- [x] `updateSettings` audita en transacción, con el diff como metadata
- [x] `diffSettings` exportada y con tests propios
- [x] Una PATCH sin cambios reales no genera fila
- [x] `cached` se actualiza solo si la transacción tuvo éxito
- [x] `adminDeleteFile` audita en transacción
- [x] El nombre del archivo **no** va en el metadata

### Tests obligatorios

`settings.service.test.ts`:
- [x] `diffSettings` devuelve solo los campos que cambiaron, con `from` y `to` correctos
- [x] `diffSettings` ignora los campos ausentes en `input` (una PATCH parcial no reporta el resto)
- [x] `updateSettings` con un cambio real → `$transaction` recibió 2 operaciones
- [x] `updateSettings` sin cambios reales → **no** se llamó a `$transaction` y devolvió el valor previo
- [x] Si la transacción rechaza → `updateSettings` tira **y** `getSettings()` sigue devolviendo el
      valor anterior (el cache no se corrompió)

`file.service.test.ts`:
- [x] `adminDeleteFile` exitoso → `$transaction` con 2 operaciones y el metadata sin el nombre del archivo
- [x] Si la transacción rechaza → `adminDeleteFile` tira (a diferencia de la auditoría fail-soft,
      acá el fallo **sí** se propaga: es el punto de usar una transacción)
- [x] El fallo del borrado físico sigue siendo no bloqueante (comportamiento actual, con su log en `error`)

---

## 3.6 Verificación de la fase

```bash
npm run test --workspace=backend
```

```bash
npm run build --workspace=backend
```

Contra la base de desarrollo, después de hacer un login, un cambio de settings y un borrado admin
de archivo:

```sql
SELECT action, user_id, actor_email, target_type, ip, request_id, created_at
FROM chat_audit_logs ORDER BY created_at DESC LIMIT 20;
```

- [x] Tests en verde, cobertura sobre los thresholds
- [x] Las filas nuevas traen `ip` y `request_id` poblados
- [x] Ese `request_id` aparece también en el log de aplicación de la misma acción
- [x] Las filas viejas (previas a esta fase) siguen ahí, con los campos nuevos en `NULL`
- [x] `grep -rn "ChatAuditAction\|ChatAuditLog" backend/src` no devuelve nada
- [x] Ninguna fila de `metadata` contiene texto de un mensaje

Commits sugeridos:
`feat(backend): modulo audit unificado con contexto de peticion`
`feat(backend): auditar login e intentos fallidos`
`feat(backend): auditar cambios de configuracion y borrado admin de archivos`

Al cerrar: marcar la Fase 3 ✅ en [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5 y correr
`/graphify . --update`.
