import { NextFunction, Request, Response } from "express";
import * as MessageService from "./message.service";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await MessageService.sendMessage(currentUserId(req), req.params.conversationId, req.body);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
}

export async function forward(req: Request, res: Response, next: NextFunction) {
  try {
    const { messageId } = req.body as { messageId: string };
    const message = await MessageService.forwardMessage(currentUserId(req), req.params.conversationId, messageId);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const query = typeof req.query.query === "string" ? req.query.query : undefined;
    const messages = await MessageService.listMessages(currentUserId(req), req.params.conversationId, {
      beforeId: before,
      limit: Number.isFinite(limit) ? limit : undefined,
      query,
    });
    res.json(messages);
  } catch (error) {
    next(error);
  }
}

export async function listFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const files = await MessageService.listConversationFiles(currentUserId(req), req.params.conversationId, {
      beforeId: before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json(files);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await MessageService.editMessage(
      currentUserId(req),
      req.params.conversationId,
      req.params.id,
      req.body,
    );
    res.json(message);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await MessageService.deleteMessage(currentUserId(req), req.params.conversationId, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function toggleReaction(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await MessageService.toggleReaction(
      currentUserId(req),
      req.params.conversationId,
      req.params.id,
      req.body.emoji,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}
