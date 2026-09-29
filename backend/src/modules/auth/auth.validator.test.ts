import { describe, expect, it } from "vitest";
import { updatePreferencesSchema, updateProfileSchema } from "./auth.validator";

describe("auth.validator", () => {
  describe("updateProfileSchema", () => {
    it("valida y hace trim a un nombre válido", async () => {
      const result = await updateProfileSchema.validate({
        name: "  Juan Pérez  ",
      });
      expect(result).toEqual({ name: "Juan Pérez" });
    });

    it("rechaza si name está ausente", async () => {
      await expect(updateProfileSchema.validate({})).rejects.toThrow();
    });

    it("rechaza si name es string vacío o solo espacios", async () => {
      await expect(updateProfileSchema.validate({ name: "   " })).rejects.toThrow();
    });

    it("rechaza si name excede los 120 caracteres", async () => {
      const longName = "a".repeat(121);
      await expect(updateProfileSchema.validate({ name: longName })).rejects.toThrow();
    });
  });

  describe("updatePreferencesSchema", () => {
    it("acepta notificationSoundEnabled en true y false", async () => {
      const resTrue = await updatePreferencesSchema.validate({
        notificationSoundEnabled: true,
      });
      expect(resTrue).toEqual({ notificationSoundEnabled: true });

      const resFalse = await updatePreferencesSchema.validate({
        notificationSoundEnabled: false,
      });
      expect(resFalse).toEqual({ notificationSoundEnabled: false });
    });

    it("rechaza si notificationSoundEnabled no está presente", async () => {
      await expect(updatePreferencesSchema.validate({})).rejects.toThrow();
    });

    it("rechaza si notificationSoundEnabled no es booleano", async () => {
      await expect(
        updatePreferencesSchema.validate({ notificationSoundEnabled: "invalid" }),
      ).rejects.toThrow();
    });

    it("acepta language en 'es' y 'en'", async () => {
      const resEs = await updatePreferencesSchema.validate({ language: "es" });
      expect(resEs).toEqual({ language: "es" });

      const resEn = await updatePreferencesSchema.validate({ language: "en" });
      expect(resEn).toEqual({ language: "en" });
    });

    it("acepta ambas preferencias juntas", async () => {
      const resBoth = await updatePreferencesSchema.validate({
        notificationSoundEnabled: true,
        language: "en",
      });
      expect(resBoth).toEqual({ notificationSoundEnabled: true, language: "en" });
    });

    it("rechaza si language no es un idioma soportado", async () => {
      await expect(
        updatePreferencesSchema.validate({ language: "fr" }),
      ).rejects.toThrow();
    });
  });
});
