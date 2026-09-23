import * as yup from "yup";

export const pollSchema = yup.object({
  question: yup.string().trim().min(1, "La pregunta no puede estar vacía").max(500).required("La pregunta es requerida"),
  options: yup
    .array()
    .of(yup.string().trim().min(1, "Las opciones no pueden estar vacías").max(200).required())
    .min(2, "Una encuesta debe tener al menos 2 opciones")
    .max(12, "Una encuesta puede tener como máximo 12 opciones")
    .required("Las opciones son requeridas")
    .test("unique-options", "Las opciones deben ser distintas", (options) => {
      if (!options) return true;
      const normalized = options.map((opt) => opt.trim().toLowerCase());
      return new Set(normalized).size === normalized.length;
    }),
  allowMultiple: yup.boolean().optional(),
}).default(undefined);

// content ya no es obligatorio: igual que WhatsApp/Telegram, se puede mandar
// un adjunto sin epígrafe. Lo que sí es obligatorio es que el mensaje tenga
// ALGO — texto, al menos un adjunto o una encuesta.
export const createMessageSchema = yup
  .object({
    content: yup.string().trim().max(4000).default(""),
    fileIds: yup.array().of(yup.string().required()),
    replyToId: yup.string().optional(),
    type: yup.string().oneOf(["STICKER", "CONTACT", "POLL", "CALL"]).optional(),
    poll: pollSchema.optional().default(undefined),
  })
  .test(
    "content-or-attachment",
    "content or fileIds is required",
    (value) => Boolean(value.content) || Boolean(value.fileIds?.length) || (value.type === "POLL" && Boolean(value.poll)),
  )
  .test(
    "sticker-shape",
    "a sticker message must have empty content and exactly one fileId",
    (value) => value.type !== "STICKER" || (!value.content && value.fileIds?.length === 1),
  )
  .test(
    "contact-shape",
    "a contact message must have content and no files",
    (value) => value.type !== "CONTACT" || (Boolean(value.content) && (!value.fileIds || value.fileIds.length === 0)),
  )
  .test(
    "poll-shape",
    "a poll message must have poll payload and no files",
    (value) => value.type !== "POLL" || (Boolean(value.poll) && (!value.fileIds || value.fileIds.length === 0)),
  )
  .test(
    "call-shape",
    "a call message must have content and no files",
    (value) => value.type !== "CALL" || (Boolean(value.content) && (!value.fileIds || value.fileIds.length === 0)),
  );

export const updateMessageSchema = yup.object({
  content: yup.string().trim().min(1).max(4000).required(),
});

export const forwardMessageSchema = yup.object({
  messageId: yup.string().required(),
});

export const toggleReactionSchema = yup.object({
  emoji: yup.string().trim().min(1).max(32).required(),
});

export const votePollSchema = yup.object({
  optionId: yup.string().trim().required("El id de la opción es requerido"),
});

