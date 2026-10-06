import * as yup from "yup";

export const updateProfileSchema = yup.object({
  name: yup.string().trim().min(1).max(120).required(),
});

/// Tope generoso solo para no aceptar bodies gigantes: el largo real lo
/// valida la política (`evaluatePasswordPolicy`, máximo 128).
const PASSWORD_INPUT_MAX = 1024;

export const changePasswordSchema = yup.object({
  currentPassword: yup.string().max(PASSWORD_INPUT_MAX).required(),
  newPassword: yup.string().max(PASSWORD_INPUT_MAX).required(),
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
