import * as yup from "yup";

export const updateProfileSchema = yup.object({
  name: yup.string().trim().min(1).max(120).required(),
});

export const updatePreferencesSchema = yup.object({
  notificationSoundEnabled: yup.boolean().required(),
});
