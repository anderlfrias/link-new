import { ConversationType, GroupPermissionLevel } from "@prisma/client";
import * as yup from "yup";

// Las reglas que dependen del `type` (name requerido para GROUP, cantidad
// mínima de miembros, etc.) viven en conversation.service.ts, no aquí: este
// schema solo valida la forma del request, no las reglas de negocio.
export const createConversationSchema = yup.object({
  type: yup.string().oneOf(Object.values(ConversationType)).required(),
  memberIds: yup.array().of(yup.string().required()).min(1).required(),
  name: yup.string().trim().min(1).max(120),
  imageFileId: yup.string(),
});

export const updateConversationSchema = yup
  .object({
    name: yup.string().trim().min(1).max(120),
    imageFileId: yup.string().nullable(),
  })
  .test(
    "at-least-one-field",
    "name or imageFileId is required",
    (value) => value.name !== undefined || value.imageFileId !== undefined,
  );

export const addMembersSchema = yup.object({
  userIds: yup.array().of(yup.string().required()).min(1).required(),
});

export const markReadSchema = yup.object({
  lastReadMessageId: yup.string(),
});

export const setMemberAdminSchema = yup.object({
  isAdmin: yup.boolean().required(),
});

export const setPinnedSchema = yup.object({
  isPinned: yup.boolean().required(),
});

export const setFavoriteSchema = yup.object({
  isFavorite: yup.boolean().required(),
});

// Solo valida la forma (subconjunto correcto de campos/valores) — si ese
// campo tiene actualmente permitido un override por grupo depende de
// AppSettings, y esa autoridad vive en conversation.service.ts
// (updateGroupSettings), no acá.
export const updateGroupSettingsSchema = yup
  .object({
    whoCanAddMembers: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanRemoveMembers: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    maxGroupMembers: yup.number().integer().min(2),
    whoCanChangeGroupInfo: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanDeleteGroup: yup.string().oneOf(Object.values(GroupPermissionLevel)),
    whoCanLeaveGroup: yup.string().oneOf(Object.values(GroupPermissionLevel)),
  })
  .test(
    "at-least-one-field",
    "At least one setting is required",
    (value) =>
      value.whoCanAddMembers !== undefined ||
      value.whoCanRemoveMembers !== undefined ||
      value.maxGroupMembers !== undefined ||
      value.whoCanChangeGroupInfo !== undefined ||
      value.whoCanDeleteGroup !== undefined ||
      value.whoCanLeaveGroup !== undefined,
  );
