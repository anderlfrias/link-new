import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as FileService from "./file.service";
import { UploadKind } from "./file.types";

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
