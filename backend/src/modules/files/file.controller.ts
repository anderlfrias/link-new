import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as FileService from "./file.service";
import { AdminFileFilters, StoredFileCategory, UploadKind } from "./file.types";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new BadRequestError('Missing file (expected multipart/form-data field "file")');
    }
    // Campos de texto opcionales dentro del mismo multipart/form-data, no
    // JSON — por eso se leen crudos de req.body en vez de pasar por validateBody.
    const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;
    const kind: UploadKind = req.body?.kind === "voice_note" ? "voice_note" : "file";
    const file = await FileService.uploadFile(currentUserId(req), req.file, conversationId, kind);
    res.status(201).json(file);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const file = await FileService.getFile(req.params.id);
    res.json(file);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await FileService.deleteFile(currentUserId(req), req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

function parseCategory(value: unknown): StoredFileCategory | undefined {
  return value === "image" || value === "audio" || value === "other" ? value : undefined;
}

function parseDateParam(value: unknown, paramName: string): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(`Invalid "${paramName}" date`);
  }
  return date;
}

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const filters: AdminFileFilters = {
      type: parseCategory(req.query.type),
      uploader: typeof req.query.uploader === "string" ? req.query.uploader.trim() || undefined : undefined,
      search: typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined,
      from: parseDateParam(req.query.from, "from"),
      to: parseDateParam(req.query.to, "to"),
    };

    const result = await FileService.listFilesForAdmin(filters, {
      beforeId: before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await FileService.adminDeleteFile(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
