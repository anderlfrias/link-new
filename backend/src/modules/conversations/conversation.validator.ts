import { ConversationType } from "@prisma/client";
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
