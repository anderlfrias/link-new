import { describe, expect, it } from "vitest";
import {
  ALL_AUDIT_ACTION_OPTIONS,
  DEFAULT_ADMIN_ACTIONS,
  getAuditActionLabel,
} from "./audit-action-labels.constant";
import { es } from "@/i18n/locales/es";
import { en } from "@/i18n/locales/en";

const ACCOUNT_ACTIONS = ["CHANGE_PASSWORD", "CREATE_USER", "UPDATE_USER", "RESET_PASSWORD"];

describe("audit-action-labels", () => {
  it("etiqueta las acciones de cuentas y contraseñas", () => {
    expect(getAuditActionLabel("CREATE_USER")).toBe("Alta de cuenta");
    expect(getAuditActionLabel("UPDATE_USER")).toBe("Edición de cuenta");
    expect(getAuditActionLabel("RESET_PASSWORD")).toBe("Restablecimiento de contraseña");
    expect(getAuditActionLabel("CHANGE_PASSWORD")).toBe("Cambio de contraseña");
  });

  it("devuelve la acción cruda si no la conoce", () => {
    expect(getAuditActionLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("espeja DEFAULT_ADMIN_AUDIT_ACTIONS del backend", () => {
    expect(DEFAULT_ADMIN_ACTIONS).toEqual([
      "LOGIN",
      "LOGIN_FAILED",
      "CHANGE_PASSWORD",
      "CREATE_USER",
      "UPDATE_USER",
      "RESET_PASSWORD",
      "UPDATE_SETTINGS",
      "ADMIN_DELETE_FILE",
    ]);
  });

  it("incluye las acciones nuevas en el filtro de 'todas las acciones'", () => {
    const values = ALL_AUDIT_ACTION_OPTIONS.map((option) => option.value);
    for (const action of DEFAULT_ADMIN_ACTIONS) expect(values).toContain(action);
  });

  it("traduce las acciones nuevas en los dos idiomas", () => {
    for (const action of ACCOUNT_ACTIONS) {
      expect(es.admin.audit.actions).toHaveProperty(action);
      expect(en.admin.audit.actions).toHaveProperty(action);
    }
  });
});
