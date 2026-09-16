import { AuditAction } from "@prisma/client";
import { BadRequestError } from "../../utils/errors";

const VALID_ACTIONS = new Set<string>(Object.values(AuditAction));

export function parseAuditAction(value: unknown): AuditAction | AuditAction[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  if (Array.isArray(value)) {
    const actions: AuditAction[] = [];
    for (const item of value) {
      if (typeof item !== "string" || !VALID_ACTIONS.has(item)) {
        throw new BadRequestError(`Invalid "action" filter: ${item}`);
      }
      actions.push(item as AuditAction);
    }
    return actions.length > 0 ? actions : undefined;
  }

  if (typeof value === "string") {
    if (value.includes(",")) {
      const split = value.split(",").map((s) => s.trim()).filter(Boolean);
      const actions: AuditAction[] = [];
      for (const item of split) {
        if (!VALID_ACTIONS.has(item)) {
          throw new BadRequestError(`Invalid "action" filter: ${item}`);
        }
        actions.push(item as AuditAction);
      }
      return actions.length > 0 ? actions : undefined;
    }

    if (!VALID_ACTIONS.has(value)) {
      throw new BadRequestError(`Invalid "action" filter: ${value}`);
    }
    return value as AuditAction;
  }

  throw new BadRequestError('Invalid "action" parameter');
}

export function parseDateParam(value: unknown, paramName: string): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(`Invalid "${paramName}" date`);
  }
  return date;
}
