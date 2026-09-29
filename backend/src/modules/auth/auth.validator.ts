import * as yup from "yup";

export const updateProfileSchema = yup.object({
  name: yup.string().trim().min(1).max(120).required(),
});

export const updatePreferencesSchema = yup
  .object({
    notificationSoundEnabled: yup.boolean().optional(),
    language: yup.string().oneOf(["es", "en"]).optional(),
  })
  .test(
    "at-least-one",
    "Debe proporcionar al menos una preferencia para actualizar",
    (value) =>
      value?.notificationSoundEnabled !== undefined || value?.language !== undefined,
  );
