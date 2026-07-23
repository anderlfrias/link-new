import * as yup from "yup";

export const createMessageSchema = yup.object({
  content: yup.string().trim().min(1).max(4000).required(),
  fileIds: yup.array().of(yup.string().required()),
});

export const updateMessageSchema = yup.object({
  content: yup.string().trim().min(1).max(4000).required(),
});
