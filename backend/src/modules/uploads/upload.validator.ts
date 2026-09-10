import * as yup from "yup";

const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/(\*|[a-z0-9][a-z0-9.+-]*)$/i;

export const initiateUploadSchema = yup.object({
  name: yup.string().required("Filename is required").trim().min(1),
  size: yup
    .number()
    .required("Size in bytes is required")
    .integer("Size must be an integer")
    .min(1, "Size must be greater than 0"),
  mimeType: yup
    .string()
    .required("Mime type is required")
    .trim()
    .matches(MIME_TYPE_PATTERN, 'Invalid mime type format (e.g. "application/pdf" or "video/mp4")'),
  conversationId: yup.string().uuid("Invalid conversationId format").optional().nullable(),
});

export const getPartUrlsSchema = yup.object({
  partNumbers: yup
    .array()
    .of(
      yup
        .number()
        .required("Part number is required")
        .integer("Part number must be an integer")
        .min(1, "Part number must be greater than or equal to 1"),
    )
    .required("partNumbers is required")
    .min(1, "At least one partNumber must be requested")
    .max(20, "Cannot request more than 20 part URLs per batch")
    .test(
      "unique-part-numbers",
      "Duplicate part numbers are not allowed in the same batch",
      (list) => !list || new Set(list).size === list.length,
    ),
});

export const completeUploadSchema = yup.object({
  checksum: yup.string().trim().optional().nullable(),
});
