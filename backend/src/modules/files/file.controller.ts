import { NextFunction, Request, Response } from "express";
import { FileProvider } from "@prisma/client";
import { getProvider, LocalDiskStorage, S3Storage } from "../../storage";
import { AppError, BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../utils/errors";
import { authenticateAccessToken } from "../auth/identity";
import * as FileRepository from "./file.repository";
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
    const userRoles = req.user?.roles ?? [];
    const file = await FileService.getFile(req.params.id, currentUserId(req), userRoles);
    res.json(file);
  } catch (error) {
    next(error);
  }
}

/// Sirve el contenido de un archivo con permisos por request (§4.5, §5.4).
/// Acepta token firmado `?t=<token>` (para <img>, <audio>, descargas) o `Authorization: Bearer`.
export async function getContent(req: Request, res: Response, next: NextFunction) {
  try {
    const fileId = req.params.id;
    const file = await FileRepository.findActiveById(fileId);
    if (!file) {
      throw new NotFoundError("Archivo no encontrado");
    }

    let userId: string | null = null;
    let userRoles: string[] = [];

    const tokenQuery = req.query.t;
    if (typeof tokenQuery === "string" && tokenQuery) {
      const verified = FileService.verifyFileToken(fileId, tokenQuery);
      if (!verified) {
        throw new UnauthorizedError("Token de archivo inválido o expirado");
      }
      userId = verified.userId;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        // Misma verificación y resolución que `authenticate` +
        // `attachInternalUser` (LOCAL_AUTH_PLAN.md, D7). Un token inválido o
        // vencido es un 401, no un error inesperado del server.
        const resolved = await authenticateAccessToken(authHeader.slice("Bearer ".length)).catch((error) => {
          throw error instanceof AppError ? error : new UnauthorizedError("Token inválido o expirado");
        });
        userId = resolved.user.internalUserId;
        userRoles = resolved.user.roles;
      }
    }

    // Si no hay token de usuario, permitimos únicamente si el archivo es un avatar público (§5.4 regla 2)
    if (!userId) {
      const isAvatar = await FileRepository.isAvatarFile(fileId);
      if (!isAvatar) {
        throw new UnauthorizedError("Autenticación requerida para acceder al contenido");
      }
    } else {
      const hasAccess = await FileService.canAccessFile(userId, fileId, userRoles);
      if (!hasAccess) {
        throw new ForbiddenError("No tienes permiso para acceder a este archivo");
      }
    }

    const forceDownload = req.query.download === "1";
    const disposition = FileService.buildContentDisposition(file.originalName, file.mimeType, forceDownload);

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", disposition);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

    if (file.provider === FileProvider.LOCAL) {
      const diskStorage = getProvider(FileProvider.LOCAL) as LocalDiskStorage;
      const absolutePath = diskStorage.getAbsolutePath(file.path);
      res.sendFile(absolutePath, { acceptRanges: true }, (err) => {
        if (err && !res.headersSent) {
          next(err);
        }
      });
      return;
    }

    if (file.provider === FileProvider.S3) {
      const s3Storage = getProvider(FileProvider.S3) as S3Storage;
      const presignedUrl = await s3Storage.getPresignedDownloadUrl(
        file.path,
        300,
        disposition,
        file.mimeType,
      );
      res.redirect(302, presignedUrl);
      return;
    }

    throw new BadRequestError(`Unsupported file provider: ${file.provider}`);
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

export async function getStatsAdmin(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await FileService.getFileStorageStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

