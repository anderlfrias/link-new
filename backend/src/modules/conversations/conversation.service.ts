import { ChatAuditAction, ConversationType, GroupPermissionLevel } from "@prisma/client";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { getIO } from "../../socket";
import { conversationRoomName, userRoomName } from "../../socket/rooms";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import * as SettingsService from "../settings/settings.service";
import { UpdateGroupSettingsInput } from "../settings/settings.types";
import * as ConversationRepository from "./conversation.repository";
import { CONVERSATION_EVENTS } from "./conversation.socket";
import {
  ConversationMemberWithUser,
  ConversationWithMembers,
  CreateConversationInput,
  MessageReceipt,
  MessageReceiptStatus,
  UpdateConversationInput,
} from "./conversation.types";

/// Estado de un mensaje para cada miembro que no sea su autor, a partir de los
/// punteros denormalizados de `ConversationMember`. "Leído" implica "entregado"
/// (por eso se chequea primero); ninguno de los dos implica que el mensaje
/// exacto haya sido visto — es una aproximación por corte de tiempo, la misma
/// que ya usa `countUnread` para no leídos, no un registro por mensaje.
export function computeReceipts(
  members: ConversationMemberWithUser[],
  message: { senderId: string; createdAt: Date },
): MessageReceipt[] {
  return members
    .filter((member) => member.userId !== message.senderId)
    .map((member) => {
      let status: MessageReceiptStatus = "sent";
      if (member.lastReadAt && message.createdAt <= member.lastReadAt) {
        status = "read";
      } else if (member.lastDeliveredAt && message.createdAt <= member.lastDeliveredAt) {
        status = "delivered";
      }
      return { userId: member.userId, status };
    });
}

/// Colapsa los recibos de todos los destinatarios en un solo estado, para la
/// lista de conversaciones (ej. "✓✓ azul" solo si TODOS ya leyeron).
export function aggregateReceiptStatus(receipts: MessageReceipt[]): MessageReceiptStatus {
  if (receipts.length === 0) return "sent";
  if (receipts.every((receipt) => receipt.status === "read")) return "read";
  if (receipts.every((receipt) => receipt.status === "read" || receipt.status === "delivered")) return "delivered";
  return "sent";
}

/// Texto a mostrar en la lista de conversaciones para el último mensaje.
/// Mismo criterio que `MessageBubble` en el frontend: un mensaje borrado
/// siempre muestra "Mensaje eliminado", sin importar su contenido original.
/// El whitespace se colapsa porque el preview se renderiza en una sola línea.
export function buildLastMessagePreview(message: {
  content: string;
  deletedAt: Date | null;
  files: { id: string }[];
}): string {
  if (message.deletedAt) return "Mensaje eliminado";

  const text = message.content.trim().replace(/\s+/g, " ");
  if (text) return text;

  return message.files.length > 0 ? "📎 Archivo adjunto" : "";
}

/// Exportada para que otros módulos con recursos anidados dentro de una
/// conversación (ej. `messages`) reutilicen la misma regla de autorización en
/// vez de duplicarla: conversación activa + el usuario es miembro.
export async function assertMembership(conversationId: string, userId: string): Promise<ConversationWithMembers> {
  const conversation = await ConversationRepository.findActiveById(conversationId);
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }
  if (!conversation.members.some((member) => member.userId === userId)) {
    throw new ForbiddenError("You are not a member of this conversation");
  }
  return conversation;
}

/// Único punto que interpreta un `GroupPermissionLevel` ya resuelto (ver
/// `resolveEffectiveGroupSettings`) contra un usuario y una conversación
/// puntual — usado por `updateConversation`/`addMembers`/`removeMember`/
/// `deleteConversation` para no repetir las 4 ramas en cada uno.
function assertGroupPermission(
  level: GroupPermissionLevel,
  conversation: ConversationWithMembers,
  currentUserId: string,
  userRoles: string[],
  message: string,
): void {
  if (level === GroupPermissionLevel.APP_ADMINS_ONLY && !userRoles.includes(ADMIN_ROLE)) {
    throw new ForbiddenError(message);
  }
  if (level === GroupPermissionLevel.CREATOR_ONLY && conversation.createdById !== currentUserId) {
    throw new ForbiddenError(message);
  }
  if (level === GroupPermissionLevel.GROUP_ADMINS_ONLY) {
    const actingMember = conversation.members.find((member) => member.userId === currentUserId);
    if (!actingMember?.isAdmin) {
      throw new ForbiddenError(message);
    }
  }
  // ALL_MEMBERS: no-op, la membresía ya se verificó en assertMembership.
}

export async function createConversation(
  currentUserId: string,
  input: CreateConversationInput,
  userRoles: string[],
) {
  const otherMemberIds = Array.from(new Set(input.memberIds)).filter((id) => id !== currentUserId);

  if (input.type === ConversationType.PRIVATE) {
    if (otherMemberIds.length !== 1) {
      throw new BadRequestError("A private conversation requires exactly one other member");
    }

    const existing = await ConversationRepository.findPrivateConversationBetween(currentUserId, otherMemberIds[0]);
    if (existing) {
      return existing;
    }
  } else {
    const settings = await SettingsService.getSettings();
    if (settings.whoCanCreateGroups === GroupPermissionLevel.APP_ADMINS_ONLY && !userRoles.includes(ADMIN_ROLE)) {
      throw new ForbiddenError("Only admins can create group conversations");
    }
    if (otherMemberIds.length < 2) {
      throw new BadRequestError("A group conversation requires at least two other members");
    }
    if (otherMemberIds.length + 1 > settings.maxGroupMembers) {
      throw new BadRequestError(`A group conversation cannot have more than ${settings.maxGroupMembers} members`);
    }
    if (!input.name?.trim()) {
      throw new BadRequestError("name is required for group conversations");
    }
  }

  const existingUsers = await ConversationRepository.countExistingUsers(otherMemberIds);
  if (existingUsers !== otherMemberIds.length) {
    throw new BadRequestError("One or more members do not exist");
  }

  const conversation = await ConversationRepository.createConversation({
    type: input.type,
    name: input.type === ConversationType.GROUP ? input.name!.trim() : undefined,
    imageFileId: input.type === ConversationType.GROUP ? input.imageFileId : undefined,
    createdById: currentUserId,
    memberIds: [currentUserId, ...otherMemberIds],
  });

  await ConversationRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.CREATE_CONVERSATION,
    conversationId: conversation.id,
  });

  // Una PRIVATE recién creada todavía no tiene mensajes (`lastMessageId` null),
  // así que `listForUser` la esconde de la lista de todos — avisar por socket
  // ahora solo generaría un refresh inútil. El primer mensaje la revela solo
  // (ver `notifyConversationListChanged` en message.service.ts). GROUP sí se
  // avisa de una: crearlo ya es una acción explícita con miembros elegidos.
  if (conversation.type === ConversationType.GROUP) {
    const io = getIO();
    conversation.members.forEach((member) => {
      io.to(userRoomName(member.userId)).emit(CONVERSATION_EVENTS.CREATED, conversation);
    });
  }

  return conversation;
}

export async function listConversations(currentUserId: string) {
  const conversations = await ConversationRepository.listForUser(currentUserId);

  // Un solo query para el contenido de todos los `lastMessageId` de la
  // página, en vez de uno por conversación (ver findLastMessagesByIds).
  const lastMessageIds = conversations
    .map((conversation) => conversation.lastMessageId)
    .filter((id): id is string => id !== null);
  const lastMessages = await ConversationRepository.findLastMessagesByIds(lastMessageIds);
  const lastMessageById = new Map(lastMessages.map((message) => [message.id, message]));

  const results = await Promise.all(
    conversations.map(async (conversation) => {
      const membership = conversation.members.find((member) => member.userId === currentUserId);
      const unreadCount = await ConversationRepository.countUnread(
        conversation.id,
        currentUserId,
        membership?.lastReadAt ?? null,
      );

      // Un "recibo" solo tiene sentido para el mensaje que YO envié — nadie
      // necesita saber si "leyó" un mensaje ajeno.
      let lastMessageStatus: MessageReceiptStatus | null = null;
      if (conversation.lastMessageSenderId === currentUserId && conversation.lastMessageAt) {
        const receipts = computeReceipts(conversation.members, {
          senderId: conversation.lastMessageSenderId,
          createdAt: conversation.lastMessageAt,
        });
        lastMessageStatus = aggregateReceiptStatus(receipts);
      }

      const lastMessage = conversation.lastMessageId ? lastMessageById.get(conversation.lastMessageId) : undefined;
      const lastMessagePreview = lastMessage ? buildLastMessagePreview(lastMessage) : null;

      return {
        ...conversation,
        unreadCount,
        lastMessageStatus,
        lastMessagePreview,
        isPinnedByMe: membership?.isPinned ?? false,
        isFavoritedByMe: membership?.isFavorite ?? false,
      };
    }),
  );

  // Fijados primero — Prisma no puede ordenar `Conversation.findMany` por un
  // campo de un solo `ConversationMember` relacionado (el mío), así que el
  // sort va acá. `.sort()` es estable: preserva el orden de `listForUser`
  // (lastMessageAt/createdAt desc) como desempate dentro de cada grupo.
  results.sort((a, b) => Number(b.isPinnedByMe) - Number(a.isPinnedByMe));

  return results;
}

export function getConversation(currentUserId: string, conversationId: string) {
  return assertMembership(conversationId, currentUserId);
}

export async function updateConversation(
  currentUserId: string,
  conversationId: string,
  input: UpdateConversationInput,
  userRoles: string[],
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations can be renamed or have their image changed");
  }

  const override = await ConversationRepository.findGroupSettings(conversationId);
  const effective = await SettingsService.resolveEffectiveGroupSettings(override);
  assertGroupPermission(
    effective.whoCanChangeGroupInfo,
    conversation,
    currentUserId,
    userRoles,
    "You are not allowed to change this group's name or image",
  );

  const trimmedName = input.name?.trim();
  const updated = await ConversationRepository.updateDetails(conversationId, {
    name: trimmedName,
    imageFileId: input.imageFileId,
  });

  if (trimmedName !== undefined) {
    await ConversationRepository.logAudit({
      userId: currentUserId,
      action: ChatAuditAction.CHANGE_NAME,
      conversationId,
      metadata: { from: conversation.name, to: updated.name },
    });
  }
  if (input.imageFileId !== undefined) {
    await ConversationRepository.logAudit({
      userId: currentUserId,
      action: ChatAuditAction.CHANGE_IMAGE,
      conversationId,
      metadata: { from: conversation.imageFileId, to: updated.imageFileId },
    });
  }

  getIO().to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.UPDATED, updated);
  return updated;
}

export async function addMembers(
  currentUserId: string,
  conversationId: string,
  userIds: string[],
  userRoles: string[],
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations support adding members");
  }

  const override = await ConversationRepository.findGroupSettings(conversationId);
  const effective = await SettingsService.resolveEffectiveGroupSettings(override);
  assertGroupPermission(
    effective.whoCanAddMembers,
    conversation,
    currentUserId,
    userRoles,
    "You are not allowed to add members to this conversation",
  );

  const existingMemberIds = new Set(conversation.members.map((member) => member.userId));
  const newUserIds = Array.from(new Set(userIds)).filter((id) => !existingMemberIds.has(id));
  if (newUserIds.length === 0) {
    throw new BadRequestError("No new members to add");
  }
  if (existingMemberIds.size + newUserIds.length > effective.maxGroupMembers) {
    throw new BadRequestError(`A group conversation cannot have more than ${effective.maxGroupMembers} members`);
  }

  const existingUsers = await ConversationRepository.countExistingUsers(newUserIds);
  if (existingUsers !== newUserIds.length) {
    throw new BadRequestError("One or more members do not exist");
  }

  await ConversationRepository.addMembers(conversationId, newUserIds);
  await Promise.all(
    newUserIds.map((userId) =>
      ConversationRepository.logAudit({
        userId: currentUserId,
        action: ChatAuditAction.ADD_MEMBER,
        conversationId,
        metadata: { addedUserId: userId },
      }),
    ),
  );

  const updated = await ConversationRepository.findActiveById(conversationId);

  const io = getIO();
  io.to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.MEMBER_ADDED, {
    conversationId,
    userIds: newUserIds,
  });
  newUserIds.forEach((userId) => {
    io.to(userRoomName(userId)).emit(CONVERSATION_EVENTS.CREATED, updated);
  });

  return updated;
}

export async function removeMember(
  currentUserId: string,
  conversationId: string,
  targetUserId: string,
  userRoles: string[],
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Members cannot be removed from a private conversation");
  }

  // Salir de la conversación (auto-remoción) siempre está permitido, sin
  // importar `whoCanRemoveMembers` — esa configuración solo gobierna remover
  // a OTRO miembro.
  const isSelf = targetUserId === currentUserId;
  if (!isSelf) {
    const override = await ConversationRepository.findGroupSettings(conversationId);
    const effective = await SettingsService.resolveEffectiveGroupSettings(override);
    assertGroupPermission(
      effective.whoCanRemoveMembers,
      conversation,
      currentUserId,
      userRoles,
      "You are not allowed to remove other members from this conversation",
    );
  }
  if (!conversation.members.some((member) => member.userId === targetUserId)) {
    throw new NotFoundError("That user is not a member of this conversation");
  }

  await ConversationRepository.removeMember(conversationId, targetUserId);
  await ConversationRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.REMOVE_MEMBER,
    conversationId,
    metadata: { removedUserId: targetUserId, self: isSelf },
  });

  getIO()
    .to(conversationRoomName(conversationId))
    .emit(CONVERSATION_EVENTS.MEMBER_REMOVED, { conversationId, userId: targetUserId });

  return { conversationId, userId: targetUserId };
}

export async function deleteConversation(currentUserId: string, conversationId: string, userRoles: string[]) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type === ConversationType.GROUP) {
    const override = await ConversationRepository.findGroupSettings(conversationId);
    const effective = await SettingsService.resolveEffectiveGroupSettings(override);
    assertGroupPermission(
      effective.whoCanDeleteGroup,
      conversation,
      currentUserId,
      userRoles,
      "You are not allowed to delete this conversation",
    );
  } else if (conversation.createdById !== currentUserId) {
    // PRIVATE mantiene la regla histórica sin cambios — whoCanDeleteGroup es
    // gobierno de GROUP únicamente.
    throw new ForbiddenError("Only the conversation creator can delete it");
  }

  await ConversationRepository.softDelete(conversationId);
  getIO().to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.DELETED, { conversationId });

  return { conversationId };
}

/// Exige que quien actúa sea admin ACTUAL de ese grupo. El creador nunca
/// puede ser degradado — invariante de negocio forzado acá, no solo en la UI.
export async function setMemberAdminStatus(
  currentUserId: string,
  conversationId: string,
  targetUserId: string,
  isAdmin: boolean,
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations have group admins");
  }

  const actingMember = conversation.members.find((member) => member.userId === currentUserId);
  if (!actingMember?.isAdmin) {
    throw new ForbiddenError("Only current group admins can promote or demote other members");
  }

  const targetMember = conversation.members.find((member) => member.userId === targetUserId);
  if (!targetMember) {
    throw new NotFoundError("That user is not a member of this conversation");
  }
  if (!isAdmin && targetUserId === conversation.createdById) {
    throw new ForbiddenError("The conversation creator can never be demoted");
  }
  if (targetMember.isAdmin === isAdmin) {
    throw new BadRequestError(isAdmin ? "That member is already a group admin" : "That member is not a group admin");
  }

  await ConversationRepository.setMemberAdmin(conversationId, targetUserId, isAdmin);
  await ConversationRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.SET_GROUP_ADMIN,
    conversationId,
    metadata: { targetUserId, isAdmin },
  });

  getIO().to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.MEMBER_ADMIN_CHANGED, {
    conversationId,
    userId: targetUserId,
    isAdmin,
  });

  return { conversationId, userId: targetUserId, isAdmin };
}

/// Lectura abierta a cualquier miembro del grupo (transparencia sobre las
/// reglas que rigen su propio grupo), no solo a sus admins.
export async function getGroupSettings(currentUserId: string, conversationId: string) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations have group settings");
  }

  const override = await ConversationRepository.findGroupSettings(conversationId);
  const effective = await SettingsService.resolveEffectiveGroupSettings(override);
  const overrideAllowed = await SettingsService.getGroupOverrideAllowedFlags();

  return { conversationId, effective, overrideAllowed };
}

/// Escritura: solo admins de ESE grupo. Rechaza cualquier campo cuyo
/// `allowGroupOverride*` global sea false, incluso si el validador de forma
/// lo dejó pasar — la autoridad final vive acá, no en el yup schema (que no
/// puede leer `AppSettings`).
export async function updateGroupSettings(
  currentUserId: string,
  conversationId: string,
  input: UpdateGroupSettingsInput,
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations have group settings");
  }

  const actingMember = conversation.members.find((member) => member.userId === currentUserId);
  if (!actingMember?.isAdmin) {
    throw new ForbiddenError("Only group admins can change this group's settings");
  }

  const settings = await SettingsService.getSettings();
  const rejected: string[] = [];
  if (input.whoCanAddMembers !== undefined && !settings.allowGroupOverrideAddMembers) {
    rejected.push("whoCanAddMembers");
  }
  if (input.whoCanRemoveMembers !== undefined && !settings.allowGroupOverrideRemoveMembers) {
    rejected.push("whoCanRemoveMembers");
  }
  if (input.maxGroupMembers !== undefined && !settings.allowGroupOverrideMaxGroupMembers) {
    rejected.push("maxGroupMembers");
  }
  if (input.whoCanChangeGroupInfo !== undefined && !settings.allowGroupOverrideChangeGroupInfo) {
    rejected.push("whoCanChangeGroupInfo");
  }
  if (input.whoCanDeleteGroup !== undefined && !settings.allowGroupOverrideDeleteGroup) {
    rejected.push("whoCanDeleteGroup");
  }
  if (rejected.length > 0) {
    throw new ForbiddenError(`This installation does not allow per-group overrides for: ${rejected.join(", ")}`);
  }

  await ConversationRepository.upsertGroupSettings(conversationId, input);

  const override = await ConversationRepository.findGroupSettings(conversationId);
  const effective = await SettingsService.resolveEffectiveGroupSettings(override);
  const overrideAllowed = await SettingsService.getGroupOverrideAllowedFlags();

  return { conversationId, effective, overrideAllowed };
}

/// Preferencia personal, self-only — a diferencia de `setMemberAdminStatus`,
/// nunca actúa sobre otro miembro. Se emite solo a la room personal de quien
/// la cambia (`userRoomName`, no `conversationRoomName`): es un dato privado
/// de organización, filtrarlo a la conversación expondría esta preferencia al
/// resto de los miembros, que no tienen por qué verla. Sin `logAudit` — mismo
/// criterio que `markConversationRead`, que tampoco audita: no es una acción
/// sobre el grupo, es una preferencia personal.
export async function setConversationPinned(currentUserId: string, conversationId: string, isPinned: boolean) {
  await assertMembership(conversationId, currentUserId);
  const membership = await ConversationRepository.setMemberPinned(conversationId, currentUserId, isPinned);

  getIO().to(userRoomName(currentUserId)).emit(CONVERSATION_EVENTS.MEMBER_PREFERENCE_CHANGED, {
    conversationId,
    isPinned: membership.isPinned,
    isFavorite: membership.isFavorite,
  });

  return membership;
}

export async function setConversationFavorite(currentUserId: string, conversationId: string, isFavorite: boolean) {
  await assertMembership(conversationId, currentUserId);
  const membership = await ConversationRepository.setMemberFavorite(conversationId, currentUserId, isFavorite);

  getIO().to(userRoomName(currentUserId)).emit(CONVERSATION_EVENTS.MEMBER_PREFERENCE_CHANGED, {
    conversationId,
    isPinned: membership.isPinned,
    isFavorite: membership.isFavorite,
  });

  return membership;
}

/// Emite a la room de la conversación Y a la room personal de cada miembro,
/// en una sola llamada — socket.io deduplica por socket cuando se encadenan
/// varias rooms en un mismo `.to()`, así que un cliente con la conversación
/// abierta (room de conversación) no recibe el evento dos veces aunque
/// también esté en su room personal. Sin esto, un remitente que NO tiene el
/// hilo abierto (viendo la lista de conversaciones, u otro chat) nunca se
/// entera de que le leyeron/entregaron el mensaje en tiempo real — se quedaba
/// con la palomita vieja hasta el próximo fetch.
function emitReceiptUpdated(
  members: ConversationMemberWithUser[],
  payload: {
    conversationId: string;
    userId: string;
    kind: "read" | "delivered";
    messageId: string | null;
    at: Date | null;
  },
): void {
  const io = getIO();
  const target = members.reduce(
    (acc, member) => acc.to(userRoomName(member.userId)),
    io.to(conversationRoomName(payload.conversationId)),
  );
  target.emit(CONVERSATION_EVENTS.RECEIPT_UPDATED, payload);
}

export async function markConversationRead(
  currentUserId: string,
  conversationId: string,
  lastReadMessageId?: string,
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  const membership = await ConversationRepository.markRead(conversationId, currentUserId, lastReadMessageId);

  emitReceiptUpdated(conversation.members, {
    conversationId,
    userId: currentUserId,
    kind: "read",
    messageId: membership.lastReadMessageId,
    at: membership.lastReadAt,
  });

  return membership;
}

/// Llamada por `messages` (al enviar un mensaje a destinatarios ya conectados,
/// o al servir el historial vía `GET /messages`) — nunca por HTTP directo, no
/// es algo que un cliente pida explícitamente como sí lo es "marcar como
/// leído". Solo emite si el puntero realmente avanzó, para no spamear el
/// evento en fetches repetidos que no aportan nada nuevo. `members` lo pasa
/// el caller (ya lo tiene cargado de `assertMembership`) para no pagar una
/// query extra solo para saber a quién avisar en su room personal.
export async function markDelivered(
  conversationId: string,
  userId: string,
  messageId: string,
  deliveredThrough: Date,
  members: ConversationMemberWithUser[],
): Promise<void> {
  const advanced = await ConversationRepository.markDelivered(conversationId, userId, messageId, deliveredThrough);
  if (!advanced) {
    return;
  }

  emitReceiptUpdated(members, {
    conversationId,
    userId,
    kind: "delivered",
    messageId,
    at: deliveredThrough,
  });
}
