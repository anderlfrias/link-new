import * as collection from "@dicebear/collection";
import type { Style } from "@dicebear/core";

export type AvatarCategoryId =
  | "all"
  | "popular"
  | "people"
  | "robots-fun"
  | "abstract"
  | "pixel-art"
  | "sketches";

export interface AvatarCategory {
  id: AvatarCategoryId;
  label: string;
  description: string;
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  { id: "all", label: "Todos", description: "Explorá todas las ilustraciones disponibles" },
  { id: "popular", label: "Populares", description: "Los avatares más elegidos y recomendados" },
  { id: "people", label: "Personas", description: "Retratos humanos en estilos modernos y expresivos" },
  { id: "robots-fun", label: "Robots y Caras", description: "Robots modulares, sonrisas y expresiones divertidas" },
  { id: "abstract", label: "Formas y Arte", description: "Composiciones geométricas abstractas y minimalistas" },
  { id: "pixel-art", label: "Pixel Art", description: "Diseños retro nostálgicos en 8-bits" },
  { id: "sketches", label: "Bocetos", description: "Ilustraciones orgánicas y dibujos a mano alzada" },
];

export interface AvatarStyleDef {
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: Style<any>;
  categoryId: Exclude<AvatarCategoryId, "all">;
  tags: string[];
  defaultBackground?: string;
}

export const AVATAR_STYLES: AvatarStyleDef[] = [
  // Personas
  {
    id: "lorelei",
    name: "Lorelei",
    style: collection.lorelei,
    categoryId: "people",
    tags: ["persona", "mujer", "hombre", "retrato", "moderno", "peinado", "elegante", "humano"],
  },
  {
    id: "openPeeps",
    name: "Open Peeps",
    style: collection.openPeeps,
    categoryId: "people",
    tags: ["persona", "divertido", "lentes", "barba", "boceto", "personaje", "trabajo", "amigo"],
  },
  {
    id: "micah",
    name: "Micah",
    style: collection.micah,
    categoryId: "people",
    tags: ["persona", "color", "editorial", "diseño", "gafas", "expresivo", "joven"],
  },
  {
    id: "personas",
    name: "Personas",
    style: collection.personas,
    categoryId: "people",
    tags: ["persona", "geométrico", "minimalista", "perfil", "moderno", "rostro"],
  },
  {
    id: "avataaars",
    name: "Avataaars",
    style: collection.avataaars,
    categoryId: "people",
    tags: ["persona", "clásico", "caricatura", "oficina", "ropa", "lentes", "sonrisa"],
  },
  {
    id: "notionists",
    name: "Notionists",
    style: collection.notionists,
    categoryId: "people",
    tags: ["persona", "notion", "minimalista", "monocromo", "estudio", "trabajo", "libros"],
  },
  {
    id: "adventurer",
    name: "Aventura",
    style: collection.adventurer,
    categoryId: "people",
    tags: ["persona", "fantasía", "aventura", "color", "sombrero", "juegos"],
  },

  // Robots y Emojis
  {
    id: "bottts",
    name: "Bottts",
    style: collection.bottts,
    categoryId: "robots-fun",
    tags: ["robot", "androide", "tecnología", "futuro", "antena", "cables", "metal", "divertido"],
  },
  {
    id: "funEmoji",
    name: "Fun Emoji",
    style: collection.funEmoji,
    categoryId: "robots-fun",
    tags: ["emoji", "cara", "sonrisa", "feliz", "ojos", "divertido", "expresión"],
  },
  {
    id: "bigSmile",
    name: "Big Smile",
    style: collection.bigSmile,
    categoryId: "robots-fun",
    tags: ["sonrisa", "dientes", "alegre", "caricatura", "divertido", "positivo"],
  },

  // Formas y Abstracto
  {
    id: "shapes",
    name: "Formas",
    style: collection.shapes,
    categoryId: "abstract",
    tags: ["abstracto", "geométrico", "formas", "círculos", "colores", "arte", "moderno"],
  },
  {
    id: "rings",
    name: "Anillos",
    style: collection.rings,
    categoryId: "abstract",
    tags: ["abstracto", "anillos", "ondas", "líneas", "elegante", "minimal"],
  },
  {
    id: "glass",
    name: "Cristal",
    style: collection.glass,
    categoryId: "abstract",
    tags: ["abstracto", "gradiente", "cristal", "difuminado", "colorido", "suave"],
  },

  // Pixel Art
  {
    id: "pixelArt",
    name: "Pixel Art",
    style: collection.pixelArt,
    categoryId: "pixel-art",
    tags: ["pixel", "retro", "8bit", "arcade", "videojuegos", "gamer", "nostalgia"],
  },

  // Bocetos
  {
    id: "croodles",
    name: "Croodles",
    style: collection.croodles,
    categoryId: "sketches",
    tags: ["boceto", "dibujo", "mano", "garabato", "orgánico", "arte", "líneas"],
  },
  {
    id: "dylan",
    name: "Dylan",
    style: collection.dylan,
    categoryId: "sketches",
    tags: ["boceto", "minimal", "línea", "ilustrado", "cara", "amigable"],
  },
];

export interface AvatarColorOption {
  name: string;
  hex: string;
  isLight?: boolean;
}

export const AVATAR_BACKGROUND_PALETTES: AvatarColorOption[] = [
  { name: "Sin fondo", hex: "transparent" },
  { name: "Azul Corporativo", hex: "0068d8" },
  { name: "Teal Corporativo", hex: "00a8a8" },
  { name: "Celeste Suave", hex: "e0f2fe", isLight: true },
  { name: "Menta Fresco", hex: "d1fae5", isLight: true },
  { name: "Esmeralda", hex: "10b981" },
  { name: "Rosa Pastel", hex: "ffe4e6", isLight: true },
  { name: "Fucsia Vibrante", hex: "f43f5e" },
  { name: "Ámbar Cálido", hex: "f59e0b" },
  { name: "Amarillo Pastel", hex: "fef3c7", isLight: true },
  { name: "Púrpura", hex: "8b5cf6" },
  { name: "Lavanda Pastel", hex: "ede9fe", isLight: true },
  { name: "Índigo", hex: "6366f1" },
  { name: "Pizarra", hex: "64748b" },
  { name: "Gris Suave", hex: "f1f5f9", isLight: true },
  { name: "Azul Noche", hex: "0f172a" },
];

/** Semillas temáticas predefinidas para dar variedad y combinaciones atractivas */
export const CURATED_SEED_PRESETS: string[] = [
  "alex", "charlie", "sam", "morgan", "taylor", "jordan",
  "casey", "riley", "avery", "logan", "quinn", "skyler",
  "cameron", "dakota", "reese", "rowan", "finley", "kendall",
  "harper", "peyton", "eden", "emerson", "hayden", "sawyer"
];
