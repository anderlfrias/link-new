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
  /// `forbidden_by_provider` no significa "contraseña incorrecta" — EXTERNAL_AUTH
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
