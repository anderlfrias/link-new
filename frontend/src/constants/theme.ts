export const THEME_STORAGE_KEY = "link:theme";

/** Clave anterior, de cuando la app se llamaba "Chat Interno". Se lee para no perder el tema que
 * alguien ya había elegido (ver `migrateLegacyKey` en `lib/storage-keys.ts`, que explica cuándo
 * se puede borrar). */
export const LEGACY_THEME_STORAGE_KEY = "chat-interno:theme";

/** Corre antes de hidratar, como script inline, para evitar el flash de tema incorrecto. Lee la
 * clave nueva y, si no existe, la vieja: como string no puede importar `migrateLegacyKey`
 * (`ThemeProvider` migra el valor ya hidratado). */
export const THEME_INIT_SCRIPT = `
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored === null) stored = localStorage.getItem(${JSON.stringify(LEGACY_THEME_STORAGE_KEY)});
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
`;
