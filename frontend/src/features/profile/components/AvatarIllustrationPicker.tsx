"use client";

import { useMemo, useState } from "react";
import {
  IconArrowsShuffle,
  IconDeviceGamepad2,
  IconLayoutGrid,
  IconPencil,
  IconRobot,
  IconSearch,
  IconShape,
  IconStar,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import {
  AVATAR_CATEGORIES,
  AVATAR_STYLES,
  CURATED_SEED_PRESETS,
  type AvatarCategoryId,
  type AvatarStyleDef,
} from "@/constants/avatar-catalog";
import { renderDiceBearDataUri } from "@/utils/dicebear-renderer";
import { cn } from "@/utils/cn";

const CATEGORY_ICONS: Record<
  AvatarCategoryId,
  React.ComponentType<{ size?: number; className?: string; stroke?: number }>
> = {
  all: IconLayoutGrid,
  popular: IconStar,
  people: IconUser,
  "robots-fun": IconRobot,
  abstract: IconShape,
  "pixel-art": IconDeviceGamepad2,
  sketches: IconPencil,
};

interface AvatarIllustrationPickerProps {
  userSeed: string;
  onSelectIllustration: (styleDef: AvatarStyleDef, seed: string) => void;
  disabled?: boolean;
}

interface DisplayItem {
  styleDef: AvatarStyleDef;
  seed: string;
  key: string;
}

export function AvatarIllustrationPicker({
  userSeed,
  onSelectIllustration,
  disabled = false,
}: AvatarIllustrationPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<AvatarCategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [shuffleIndex, setShuffleIndex] = useState(0);

  // Filtrar estilos según categoría y término de búsqueda
  const filteredStyles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return AVATAR_STYLES.filter((styleDef) => {
      // Filtro por categoría
      if (selectedCategory === "popular") {
        const isPopular = ["lorelei", "openPeeps", "bottts", "micah", "shapes", "avataaars", "bigSmile", "pixelArt"].includes(styleDef.id);
        if (!isPopular) return false;
      } else if (selectedCategory !== "all" && styleDef.categoryId !== selectedCategory) {
        return false;
      }

      // Filtro por búsqueda
      if (!query) return true;

      const nameMatch = styleDef.name.toLowerCase().includes(query);
      const tagMatch = styleDef.tags.some((tag) => tag.toLowerCase().includes(query));
      return nameMatch || tagMatch;
    });
  }, [selectedCategory, searchQuery]);

  // Generar la lista de ítems a desplegar
  const displayItems = useMemo<DisplayItem[]>(() => {
    const items: DisplayItem[] = [];

    // Cantidad de variantes por estilo según si hay filtro activo o es la vista general
    const variantsPerStyle =
      searchQuery.trim().length > 0 || (selectedCategory !== "all" && selectedCategory !== "popular")
        ? 6
        : 3;

    filteredStyles.forEach((styleDef) => {
      for (let i = 0; i < variantsPerStyle; i++) {
        // Combinar userSeed, preset curado y shuffleIndex para estabilidad y variedad
        const seedPreset = CURATED_SEED_PRESETS[(i + shuffleIndex) % CURATED_SEED_PRESETS.length];
        const itemSeed = `${userSeed}-${styleDef.id}-${seedPreset}-${i + shuffleIndex}`;
        items.push({
          styleDef,
          seed: itemSeed,
          key: `${styleDef.id}-${i}-${shuffleIndex}`,
        });
      }
    });

    return items;
  }, [filteredStyles, userSeed, shuffleIndex, searchQuery, selectedCategory]);

  return (
    <div className="flex flex-col h-full">
      {/* Buscador & Acciones superiores */}
      <div className="px-4 pt-3 pb-2 space-y-2.5">
        <div className="relative flex items-center">
          <IconSearch
            size={18}
            className="absolute left-3 text-neutral-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar ilustraciones (ej. doctor, lentes, robot, arte...)"
            className="w-full rounded-xl border border-black/10 bg-neutral-50 py-2 pl-9 pr-9 text-sm text-brand-ink outline-none transition-all placeholder:text-neutral-400 focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-brand-blue dark:focus:bg-neutral-900"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <IconX size={16} />
            </button>
          )}
        </div>

        {/* Chips de categorías estilo Google con iconos vectoriales */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {AVATAR_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const CategoryIcon = CATEGORY_ICONS[cat.id];
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  isSelected
                    ? "bg-brand-blue text-white shadow-sm"
                    : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10",
                )}
              >
                {CategoryIcon && <CategoryIcon size={14} stroke={1.75} />}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>


      {/* Galería de avatares con scroll */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              No se encontraron ilustraciones para &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-2 text-xs font-semibold text-brand-blue hover:underline"
            >
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {displayItems.map((item) => (
              <AvatarCard
                key={item.key}
                styleDef={item.styleDef}
                seed={item.seed}
                disabled={disabled}
                onClick={() => onSelectIllustration(item.styleDef, item.seed)}
              />
            ))}
          </div>
        )}

        {/* Botón para mezclar y cargar más variantes */}
        {displayItems.length > 0 && (
          <div className="mt-6 mb-2 flex justify-center">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShuffleIndex((prev) => prev + 3)}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-brand-blue shadow-sm transition-all hover:bg-black/5 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800 dark:text-brand-blue-light dark:hover:bg-white/10"
            >
              <IconArrowsShuffle size={16} />
              <span>Mezclar y ver nuevas opciones</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface AvatarCardProps {
  styleDef: AvatarStyleDef;
  seed: string;
  disabled?: boolean;
  onClick: () => void;
}

function AvatarCard({ styleDef, seed, disabled, onClick }: AvatarCardProps) {
  const dataUri = useMemo(() => {
    return renderDiceBearDataUri(styleDef.style, {
      seed,
      size: 96,
    });
  }, [styleDef, seed]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-all hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
    >
      <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-neutral-100 shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:border-brand-blue group-hover:shadow-md dark:border-white/10 dark:bg-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt={`Ilustración ${styleDef.name}`}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </div>
      <span className="text-[11px] font-medium text-neutral-500 transition-colors group-hover:text-brand-blue dark:text-neutral-400 dark:group-hover:text-brand-blue-light truncate max-w-[80px]">
        {styleDef.name}
      </span>
    </button>
  );
}
