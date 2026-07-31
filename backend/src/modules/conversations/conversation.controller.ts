import { NextFunction, Request, Response } from "express";
import * as ConversationService from "./conversation.service";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

function currentUserRoles(req: Request): string[] {
  return req.user?.roles ?? [];
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await ConversationService.createConversation(
      currentUserId(req),
      req.body,
      currentUserRoles(req),
    );
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const conversations = await ConversationService.listConversations(currentUserId(req));
    res.json(conversations);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await ConversationService.getConversation(currentUserId(req), req.params.id);
    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await ConversationService.updateConversation(currentUserId(req), req.params.id, req.body);
    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ConversationService.deleteConversation(currentUserId(req), req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function addMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const { userIds } = req.body as { userIds: string[] };
    const conversation = await ConversationService.addMembers(
      currentUserId(req),
      req.params.id,
      userIds,
      currentUserRoles(req),
    );
    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ConversationService.removeMember(
      currentUserId(req),
      req.params.id,
      req.params.userId,
      currentUserRoles(req),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { lastReadMessageId } = req.body as { lastReadMessageId?: string };
    const membership = await ConversationService.markConversationRead(
      currentUserId(req),
      req.params.id,
      lastReadMessageId,
    );
    res.json(membership);
  } catch (error) {
    next(error);
  }
}
