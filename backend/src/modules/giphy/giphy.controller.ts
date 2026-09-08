import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as GiphyService from "./giphy.service";
import { GiphyMediaKind } from "./giphy.types";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

function parseKind(value: unknown): GiphyMediaKind {
  if (value === "gifs" || value === "stickers") return value;
  throw new BadRequestError('"kind" must be "gifs" or "stickers"');
}

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const kind = parseKind(req.query.kind);
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) throw new BadRequestError('"q" is required');
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;
    const results = await GiphyService.searchGiphy(kind, q, {
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });
    res.json(results);
  } catch (error) {
    next(error);
  }
}

export async function trending(req: Request, res: Response, next: NextFunction) {
  try {
    const kind = parseKind(req.query.kind);
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const results = await GiphyService.getTrendingGiphy(kind, { limit: Number.isFinite(limit) ? limit : undefined });
    res.json(results);
  } catch (error) {
    next(error);
  }
}

export async function importAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const { kind, giphyId, originalUrl } = req.body as { kind: GiphyMediaKind; giphyId: string; originalUrl: string };
    const file = await GiphyService.importGiphyAsset(currentUserId(req), kind, giphyId, originalUrl);
    res.status(201).json(file);
  } catch (error) {
    next(error);
  }
}
