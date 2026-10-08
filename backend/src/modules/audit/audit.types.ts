import { AuditAction, ConversationType, FileProvider, MessageType } from "@prisma/client";

/// Motivo de un `LOGIN_FAILED`, tal como el backend realmente lo puede
/// distinguir. Los cuatro primeros son de un proveedor externo. Ojo:
/// `forbidden_by_provider` no significa "contraseña incorrecta" — muchos
/// proveedores rechazan igual las credenciales inválidas y la falta de acceso a
/// la app, y no se pueden separar (ver `loginErrorFor` en external-login.service.ts).
/// Nombrarlo "invalid_credentials" sería registrar una conclusión que el
/// sistema no tiene. Los del modo local sí distinguen la causa: la respuesta
/// HTTP es la misma a propósito (anti-enumeración, LOCAL_AUTH_PLAN.md D12),
/// pero la auditoría la lee un admin. `account_disabled` aplica a los dos modos.
export type LoginFailureReason =
  | "forbidden_by_provider"
  | "invalid_credentials"
  | "provider_error"
  | "provider_unreachable"
  | "unknown_account"
  | "wrong_password"
  | "no_credential"
  | "account_disabled"
  | "account_locked";

/// Desde dónde un admin administró una cuenta: el panel o el CLI
/// `src/cli/auth-admin.ts` (LOCAL_AUTH_PLAN.md, D18).
export type AccountAdminVia = "panel" | "cli";

/// Por qué alguien cambió su propia contraseña: por decisión propia, o porque
/// el login se lo exigió (LOCAL_AUTH_PLAN.md, D13).
export type PasswordChangeReason = "voluntary" | "reset" | "expired" | "policy";

/// Campos de una cuenta que `UPDATE_USER` diffea. Ninguno es secreto: la
/// contraseña nunca pasa por esta acción (la cubren `RESET_PASSWORD` y
/// `CHANGE_PASSWORD`, sin metadata de la contraseña).
export type AuditedUserField = "name" | "email" | "username" | "status" | "roles" | "locked";

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

  /// `provider` es el modo de la instalación al momento del intento. Las filas
  /// anteriores a LOCAL_AUTH_PLAN.md no lo traen: quien las lea tiene que
  /// interpretar "ausente" como "external-auth".
  /// `provider`: "local", o el id del proveedor externo que autenticó.
  LOGIN: { provider: string };
  LOGIN_FAILED: { provider: string; reason: LoginFailureReason };
  /// Acciones de administración de cuentas: van en la misma transacción que su
  /// efecto. Ninguna lleva la contraseña, su hash ni su longitud, ni el token.
  CREATE_USER: { via: AccountAdminVia; roles: string[] };
  UPDATE_USER: {
    via: AccountAdminVia;
    changed: Partial<Record<AuditedUserField, { from: unknown; to: unknown }>>;
  };
  RESET_PASSWORD: { via: AccountAdminVia };
  /// La propia: `record` fail-soft, igual que LOGIN.
  CHANGE_PASSWORD: { reason: PasswordChangeReason };
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
  START_CALL: { callType: "AUDIO" | "VIDEO" };
  END_CALL: { callType: "AUDIO" | "VIDEO"; duration: number; status: string };
};

/// Lo que ve un admin si no filtra por acción: accesos, cuentas y
/// administración, nunca actividad del chat (privacidad por omisión).
export const DEFAULT_ADMIN_AUDIT_ACTIONS: AuditAction[] = [
  AuditAction.LOGIN,
  AuditAction.LOGIN_FAILED,
  AuditAction.CHANGE_PASSWORD,
  AuditAction.CREATE_USER,
  AuditAction.UPDATE_USER,
  AuditAction.RESET_PASSWORD,
  AuditAction.UPDATE_SETTINGS,
  AuditAction.ADMIN_DELETE_FILE,
];

export interface AuditLogFilters {
  action?: AuditAction | AuditAction[];
  userId?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogListOptions {
  beforeId?: string;
  limit?: number;
}

export interface AuditLogListItem {
  id: string;
  action: AuditAction;
  createdAt: string;
  actor: { id: string | null; email: string | null; name: string | null };
  conversationId: string | null;
  /// Solo para conversaciones GROUP — null para PRIVATE, SELF o eventos sin conversación.
  conversationName: string | null;
  messageId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AuditLogListResponse {
  items: AuditLogListItem[];
  nextCursor: string | null;
}
