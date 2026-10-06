export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE_CONVERSATION: "Creación de conversación",
  ADD_MEMBER: "Miembro añadido",
  REMOVE_MEMBER: "Miembro eliminado",
  SEND_MESSAGE: "Mensaje enviado",
  FORWARD_MESSAGE: "Mensaje reenviado",
  EDIT_MESSAGE: "Mensaje editado",
  DELETE_MESSAGE: "Mensaje eliminado",
  CHANGE_NAME: "Cambio de nombre de grupo",
  CHANGE_IMAGE: "Cambio de imagen de grupo",
  SET_GROUP_ADMIN: "Cambio de admin de grupo",
  LOGIN: "Inicio de sesión",
  LOGIN_FAILED: "Inicio de sesión fallido",
  CHANGE_PASSWORD: "Cambio de contraseña",
  CREATE_USER: "Alta de cuenta",
  UPDATE_USER: "Edición de cuenta",
  RESET_PASSWORD: "Restablecimiento de contraseña",
  UPDATE_SETTINGS: "Actualización de configuración",
  ADMIN_DELETE_FILE: "Eliminación de archivo por admin",
};

/** Espejo de `DEFAULT_ADMIN_AUDIT_ACTIONS` en backend/src/modules/audit/audit.types.ts:
 * lo que el backend devuelve cuando no se filtra por acción. */
export const DEFAULT_ADMIN_ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "CHANGE_PASSWORD",
  "CREATE_USER",
  "UPDATE_USER",
  "RESET_PASSWORD",
  "UPDATE_SETTINGS",
  "ADMIN_DELETE_FILE",
];

export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export interface AuditActionOption {
  value: string;
  label: string;
}

export const ALL_AUDIT_ACTION_OPTIONS: AuditActionOption[] = Object.entries(AUDIT_ACTION_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);
