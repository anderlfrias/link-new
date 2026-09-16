import { AuditAction } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { BadRequestError } from "../../utils/errors";
import { parseAuditAction, parseDateParam } from "./audit.validator";

describe("audit.validator", () => {
  describe("parseAuditAction", () => {
    it("retorna undefined si el valor es undefined, null o vacío", () => {
      expect(parseAuditAction(undefined)).toBeUndefined();
      expect(parseAuditAction(null)).toBeUndefined();
      expect(parseAuditAction("")).toBeUndefined();
    });

    it("parsea una acción simple válida", () => {
      expect(parseAuditAction("LOGIN")).toBe(AuditAction.LOGIN);
    });

    it("parsea una lista separada por comas", () => {
      expect(parseAuditAction("LOGIN,LOGIN_FAILED")).toEqual([
        AuditAction.LOGIN,
        AuditAction.LOGIN_FAILED,
      ]);
    });

    it("parsea un array de acciones", () => {
      expect(parseAuditAction(["LOGIN", "UPDATE_SETTINGS"])).toEqual([
        AuditAction.LOGIN,
        AuditAction.UPDATE_SETTINGS,
      ]);
    });

    it("rechaza una acción desconocida con BadRequestError", () => {
      expect(() => parseAuditAction("INVALID_ACTION")).toThrow(BadRequestError);
      expect(() => parseAuditAction(["LOGIN", "NOT_EXIST"])).toThrow(BadRequestError);
      expect(() => parseAuditAction("LOGIN,NOT_EXIST")).toThrow(BadRequestError);
    });

    it("rechaza tipos no soportados", () => {
      expect(() => parseAuditAction(123)).toThrow(BadRequestError);
    });
  });

  describe("parseDateParam", () => {
    it("retorna undefined para valor vacío o no string", () => {
      expect(parseDateParam(undefined, "from")).toBeUndefined();
      expect(parseDateParam("", "from")).toBeUndefined();
    });

    it("parsea fecha ISO válida", () => {
      const date = parseDateParam("2026-09-10T00:00:00.000Z", "from");
      expect(date).toBeInstanceOf(Date);
      expect(date?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    });

    it("lanza BadRequestError si la fecha es inválida", () => {
      expect(() => parseDateParam("invalid-date", "from")).toThrow(BadRequestError);
      expect(() => parseDateParam("invalid-date", "from")).toThrow(/Invalid "from" date/);
    });
  });
});
