"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useTranslation } from "@/i18n";
import { updateUserPreferences } from "@/features/auth/api/auth.api";
import type { Locale } from "@/i18n/types";

/**
 * Hook para cambiar el idioma de la aplicación.
 * Aplica el cambio en el contexto de i18n inmediatamente y,
 * si hay una sesión activa, lo persiste en el backend del usuario.
 */
export function useUpdateLanguage() {
  const { session, updateSessionUser } = useAuth();
  const { locale, setLocale } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeLanguage = useCallback(
    async (newLocale: Locale) => {
      setLocale(newLocale);

      if (!session) return true;

      setPending(true);
      setError(null);
      try {
        const updated = await updateUserPreferences(session.token, { language: newLocale });
        updateSessionUser({ language: updated.language ?? newLocale });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo sincronizar el idioma en el servidor.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session, setLocale, updateSessionUser],
  );

  return { currentLocale: locale, changeLanguage, pending, error };
}
