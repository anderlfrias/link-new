/** Ver https://boringavatars.com — usado para los avatares generados que el usuario puede elegir en su perfil. */

/** Misma paleta de marca que `globals.css` (`--color-brand-*`), de oscuro a claro. */
export const BORING_AVATAR_COLORS = ["#002040", "#0050c0", "#0068d8", "#0898a0", "#10b8b8"];

export const BORING_AVATAR_VARIANTS = ["marble", "beam", "pixel", "sunset", "ring", "bauhaus"] as const;

export type BoringAvatarVariant = (typeof BORING_AVATAR_VARIANTS)[number];

/** Cuántas opciones (patrones distintos, misma variante y colores) se ofrecen al elegir una variante. */
export const BORING_AVATAR_OPTION_COUNT = 8;
