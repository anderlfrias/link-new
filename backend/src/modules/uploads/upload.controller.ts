import { NextFunction, Request, Response } from "express";
import * as UploadService from "./upload.service";

export async function initiate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.internalUserId!;
    const result = await UploadService.initiateUpload(userId, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.internalUserId!;
    const userRoles = req.user?.roles ?? [];
    const result = await UploadService.getUploadStatus(req.params.id, userId, userRoles);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPartUrls(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.internalUserId!;
    const userRoles = req.user?.roles ?? [];
    const result = await UploadService.getPartUrls(req.params.id, userId, userRoles, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.internalUserId!;
    const userRoles = req.user?.roles ?? [];
    const result = await UploadService.completeUpload(req.params.id, userId, userRoles, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function abort(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.internalUserId!;
    const userRoles = req.user?.roles ?? [];
    const result = await UploadService.abortUpload(req.params.id, userId, userRoles);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
