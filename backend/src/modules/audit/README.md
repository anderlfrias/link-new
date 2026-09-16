# Módulo Audit

Este módulo gestiona la escritura del **audit trail de cumplimiento normativo** del sistema.

> [!IMPORTANT]
> Esta tabla (`AuditLog`, mapeada físicamente a `chat_audit_logs`) es el **audit trail de negocio/cumplimiento** y **NO** el log de aplicación. Ver [LOGGING_PLAN.md](../../../LOGGING_PLAN.md) §3 para entender las diferencias conceptuales y arquitectónicas entre ambos sistemas.

## Propósito y Filosofía

- **Audit trail vs Application Logs**: El audit trail registra hechos consumados del negocio (quién creó una conversación, quién cambió la configuración, intentos de login). Solo se retiene la metadata mínima indispensable, estructurada y cerrada.
- **Fail-soft en chat, Transaccional en admin**:
  - Para acciones cotidianas del chat (`record`), la auditoría nunca bloquea ni falla la petición principal si la base tiene un problema temporal; se registra el fallo con `logger.error`.
  - Para acciones administrativas (`UPDATE_SETTINGS`, `ADMIN_DELETE_FILE`), la auditoría se ejecuta **dentro de la misma transacción** (`prisma.$transaction`) que el cambio que audita.
- **Privacidad estricta**:
  - **NUNCA** se almacena contenido de mensajes de texto en la auditoría (ver `EDIT_MESSAGE` sin metadata).
  - Nombres originales de archivos no se duplican en `metadata` (se audita `targetId` del `StoredFile`).

## Nombre Físico Histórico

El modelo de Prisma es `AuditLog` y el enum es `AuditAction`, pero la tabla física en PostgreSQL se conserva como `chat_audit_logs` y el tipo enum como `chat_audit_action` mediante `@@map`. Esto permite conservar la base histórica de registros sin necesidad de migraciones destructivas.

## Tabla de Acciones y Metadata

El contrato de `metadata` está tipado estrictamente en `audit.types.ts` mediante `AuditMetadataMap`:

| Acción | `targetType` / `targetId` | Metadata | Descripción |
|---|---|---|---|
| `CREATE_CONVERSATION` | No aplica | `{ conversationType: ConversationType }` | Creación de conversación privada, grupal o self. |
| `ADD_MEMBER` | No aplica | `{ memberId: string }` | Incorporación de un miembro al grupo. |
| `REMOVE_MEMBER` | No aplica | `{ memberId: string }` | Expulsión o salida de un miembro del grupo. |
| `SET_GROUP_ADMIN` | No aplica | `{ memberId: string, isAdmin: boolean }` | Asignación o remoción de rol admin de grupo. |
| `CHANGE_NAME` | No aplica | `{ from: string \| null, to: string \| null }` | Cambio de nombre del grupo. |
| `CHANGE_IMAGE` | No aplica | `{ from: string \| null, to: string \| null }` | Cambio de avatar/imagen del grupo. |
| `SEND_MESSAGE` | No aplica | `{ messageType: MessageType, fileCount: number }` | Envío de mensaje. |
| `FORWARD_MESSAGE` | No aplica | `{ fromConversationId: string }` | Reenvío de mensaje. |
| `EDIT_MESSAGE` | No aplica | `undefined` (sin metadata) | Edición de mensaje. No guarda contenido anterior ni nuevo por privacidad. |
| `DELETE_MESSAGE` | No aplica | `{ deletedOwnMessage: boolean }` | Eliminación de mensaje. |
| `LOGIN` | No aplica | `undefined` (sin metadata) | Inicio de sesión exitoso. `userId` y `actorEmail` explícitos. |
| `LOGIN_FAILED` | No aplica | `{ reason: "forbidden_by_provider" \| "invalid_credentials" \| "provider_error" \| "provider_unreachable" }` | Intento fallido de login. `userId: null`, `actorEmail` con el usuario intentado. |
| `UPDATE_SETTINGS` | `"AppSettings"` / `"singleton"` | `{ changed: Record<string, { from: unknown, to: unknown }> }` | Cambio de configuración global en transacción. |
| `ADMIN_DELETE_FILE` | `"StoredFile"` / `fileId` | `{ provider: FileProvider, sizeBytes: number, mimeType: string }` | Borrado administrativo de archivo en transacción. |

## Cómo agregar una nueva acción auditable

Si se necesita registrar una nueva acción en el sistema:
1. Agregar el valor al enum `AuditAction` en `backend/prisma/schema.prisma` con su `@map(...)` correspondiente.
2. Agregar la definición estricta en `AuditMetadataMap` dentro de `backend/src/modules/audit/audit.types.ts` (`undefined` si no lleva metadata).
3. Documentar la fila correspondiente en la tabla de este `README.md`.

Los tres pasos son obligatorios.
