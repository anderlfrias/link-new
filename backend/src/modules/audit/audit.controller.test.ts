import { AuditAction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";
import { BadRequestError } from "../../utils/errors";

vi.mock("./audit.service", () => ({
  listAuditLogs: vi.fn(),
}));

import { listAdmin } from "./audit.controller";
import * as AuditService from "./audit.service";

describe("audit.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listAdmin", () => {
    it("parsea query params y responde el resultado de AuditService.listAuditLogs", async () => {
      const req = createMockRequest({
        query: {
          action: "LOGIN,LOGIN_FAILED",
          userId: "user-1",
          targetType: "StoredFile",
          from: "2026-09-01T00:00:00.000Z",
          to: "2026-09-10T00:00:00.000Z",
          before: "cursor-1",
          limit: "25",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockResponse = { items: [], nextCursor: null };
      vi.mocked(AuditService.listAuditLogs).mockResolvedValue(mockResponse as any);

      await listAdmin(req, res, next);

      expect(AuditService.listAuditLogs).toHaveBeenCalledWith(
        {
          action: [AuditAction.LOGIN, AuditAction.LOGIN_FAILED],
          userId: "user-1",
          targetType: "StoredFile",
          from: new Date("2026-09-01T00:00:00.000Z"),
          to: new Date("2026-09-10T00:00:00.000Z"),
        },
        {
          beforeId: "cursor-1",
          limit: 25,
        },
      );
      expect(res.json).toHaveBeenCalledWith(mockResponse);
      expect(next).not.toHaveBeenCalled();
    });

    it("pasa BadRequestError a next si la fecha from es inválida", async () => {
      const req = createMockRequest({ query: { from: "fecha-invalida" } });
      const res = createMockResponse();
      const next = createMockNext();

      await listAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestError);
      expect(err.message).toMatch(/Invalid "from" date/i);
    });

    it("pasa BadRequestError a next si la acción es inválida", async () => {
      const req = createMockRequest({ query: { action: "ACCION_INEXISTENTE" } });
      const res = createMockResponse();
      const next = createMockNext();

      await listAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestError);
      expect(err.message).toMatch(/Invalid "action" filter/i);
    });
  });
});
