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

export async function getOrCreateSelf(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await ConversationService.getOrCreateSelfChat(currentUserId(req));
    res.json(conversation);
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
    const conversation = await ConversationService.updateConversation(
      currentUserId(req),
      req.params.id,
      req.body,
      currentUserRoles(req),
    );
    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ConversationService.deleteConversation(
      currentUserId(req),
      req.params.id,
      currentUserRoles(req),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function setMemberAdminStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { isAdmin } = req.body as { isAdmin: boolean };
    const result = await ConversationService.setMemberAdminStatus(
      currentUserId(req),
      req.params.id,
      req.params.userId,
      isAdmin,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getGroupSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await ConversationService.getGroupSettings(currentUserId(req), req.params.id);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function updateGroupSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await ConversationService.updateGroupSettings(currentUserId(req), req.params.id, req.body);
    res.json(settings);
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

export async function setPinned(req: Request, res: Response, next: NextFunction) {
  try {
    const { isPinned } = req.body as { isPinned: boolean };
    const result = await ConversationService.setConversationPinned(currentUserId(req), req.params.id, isPinned);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function setFavorite(req: Request, res: Response, next: NextFunction) {
  try {
    const { isFavorite } = req.body as { isFavorite: boolean };
    const result = await ConversationService.setConversationFavorite(currentUserId(req), req.params.id, isFavorite);
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
