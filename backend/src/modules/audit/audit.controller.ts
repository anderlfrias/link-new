import { NextFunction, Request, Response } from "express";
import * as AuditService from "./audit.service";
import { AuditLogFilters } from "./audit.types";
import { parseAuditAction, parseDateParam } from "./audit.validator";

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const filters: AuditLogFilters = {
      action: parseAuditAction(req.query.action),
      userId: typeof req.query.userId === "string" ? req.query.userId.trim() || undefined : undefined,
      targetType: typeof req.query.targetType === "string" ? req.query.targetType.trim() || undefined : undefined,
      from: parseDateParam(req.query.from, "from"),
      to: parseDateParam(req.query.to, "to"),
    };

    const result = await AuditService.listAuditLogs(filters, {
      beforeId: before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}
