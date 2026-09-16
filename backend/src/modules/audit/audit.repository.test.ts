import { AuditAction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../config/prisma";
import {
  buildAdminAuditWhere,
  create,
  createOperation,
  deleteOlderThan,
  listForAdmin,
} from "./audit.repository";

describe("audit.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create y createOperation", () => {
    it("createOperation devuelve la operación de prisma.auditLog.create sin ejecutarla", () => {
      const mockPromise = {} as any;
      vi.mocked(prisma.auditLog.create).mockReturnValue(mockPromise);

      const data = { action: AuditAction.LOGIN };
      const op = createOperation(data);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data });
      expect(op).toBe(mockPromise);
    });

    it("create ejecuta createOperation", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "log-1" } as any);

      const data = { action: AuditAction.LOGIN };
      const res = await create(data);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data });
      expect(res).toEqual({ id: "log-1" });
    });
  });

  describe("buildAdminAuditWhere", () => {
    it("sin filtros devuelve objeto where vacío", () => {
      expect(buildAdminAuditWhere({})).toEqual({});
    });

    it("con action simple construye { in: [action] }", () => {
      const where = buildAdminAuditWhere({ action: AuditAction.LOGIN });
      expect(where).toEqual({
        AND: [{ action: { in: [AuditAction.LOGIN] } }],
      });
    });

    it("con action array construye { in: actions }", () => {
      const actions = [AuditAction.LOGIN, AuditAction.LOGIN_FAILED];
      const where = buildAdminAuditWhere({ action: actions });
      expect(where).toEqual({
        AND: [{ action: { in: actions } }],
      });
    });

    it("con userId y targetType agrega las condiciones al AND", () => {
      const where = buildAdminAuditWhere({ userId: "u-123", targetType: "StoredFile" });
      expect(where).toEqual({
        AND: [
          { userId: "u-123" },
          { targetType: "StoredFile" },
        ],
      });
    });

    it("con from y to arma el rango sobre createdAt", () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.999Z");
      const where = buildAdminAuditWhere({ from, to });
      expect(where).toEqual({
        AND: [
          {
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        ],
      });
    });
  });

  describe("listForAdmin", () => {
    it("sin filtros → where vacío, orden createdAt desc, take = limit", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await listForAdmin({}, { limit: 50 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: { select: { id: true, email: true, name: true } },
          conversation: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("con action simple y con array → in bien armado", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      // Simple
      await listForAdmin({ action: AuditAction.LOGIN }, { limit: 20 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ action: { in: [AuditAction.LOGIN] } }] },
        }),
      );

      // Array
      await listForAdmin(
        { action: [AuditAction.LOGIN, AuditAction.LOGIN_FAILED] },
        { limit: 20 },
      );
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ action: { in: [AuditAction.LOGIN, AuditAction.LOGIN_FAILED] } }],
          },
        }),
      );
    });

    it("con from/to → rango sobre createdAt", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T23:59:59.999Z");

      await listForAdmin({ from, to }, { limit: 10 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                createdAt: {
                  gte: from,
                  lte: to,
                },
              },
            ],
          },
        }),
      );
    });

    it("con before → paginación por cursor aplicada", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await listForAdmin({}, { beforeId: "cursor-log-id", limit: 30 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: "cursor-log-id" },
          skip: 1,
          take: 30,
        }),
      );
    });
  });

  describe("deleteOlderThan", () => {
    it("llama a prisma.auditLog.deleteMany con cutoffDate y retorna count", async () => {
      vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 17 } as any);

      const cutoffDate = new Date("2026-06-01T00:00:00.000Z");
      const count = await deleteOlderThan(cutoffDate);

      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });
      expect(count).toBe(17);
    });
  });
});
