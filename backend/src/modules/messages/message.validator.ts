import * as yup from "yup";

// content ya no es obligatorio: igual que WhatsApp/Telegram, se puede mandar
// un adjunto sin epígrafe. Lo que sí es obligatorio es que el mensaje tenga
// ALGO — texto o al menos un adjunto (ver el .test de abajo).
export const createMessageSchema = yup
  .object({
    content: yup.string().trim().max(4000).default(""),
    fileIds: yup.array().of(yup.string().required()),
    replyToId: yup.string().optional(),
  })
  .test(
    "content-or-attachment",
    "content or fileIds is required",
    (value) => Boolean(value.content) || Boolean(value.fileIds?.length),
  );

export const updateMessageSchema = yup.object({
  content: yup.string().trim().min(1).max(4000).required(),
});

export const forwardMessageSchema = yup.object({
  messageId: yup.string().required(),
});
