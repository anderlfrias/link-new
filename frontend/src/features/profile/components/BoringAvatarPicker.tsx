"use client";

import { useRef, useState } from "react";
import BoringAvatar from "boring-avatars";
import { IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import {
  BORING_AVATAR_COLORS,
  BORING_AVATAR_OPTION_COUNT,
  BORING_AVATAR_VARIANTS,
  type BoringAvatarVariant,
} from "@/constants/boring-avatars";
import { svgElementToPngBlob } from "@/utils/svg-to-png";
import { cn } from "@/utils/cn";

const VARIANT_LABELS: Record<BoringAvatarVariant, string> = {
  marble: "Marble",
  beam: "Beam",
  pixel: "Pixel",
  sunset: "Sunset",
  ring: "Ring",
  bauhaus: "Bauhaus",
};

const PREVIEW_SIZE = 56;
/** Resolución del PNG que se sube — más grande que el preview para que no se vea pixelado como avatar real. */
const EXPORT_SIZE = 256;

interface BoringAvatarPickerProps {
  /** Semilla estable (ej. internalUserId) — cada opción deriva de esta, así se ven siempre igual para este usuario. */
  seed: string;
  onSelect: (image: Blob) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Boring Avatars genera un patrón distinto por cada string de `name` que
 * recibe (es un hash, no hay "randomize"). Por eso elegir "una opción" dentro
 * de una variante significa probar la misma variante+colores con distintas
 * semillas derivadas — acá `${seed}-${index}` — no es un color/variante nuevo,
 * solo un patrón visualmente distinto dentro de la misma variante elegida.
 */
export function BoringAvatarPicker({ seed, onSelect, disabled }: BoringAvatarPickerProps) {
  const [variant, setVariant] = useState<BoringAvatarVariant | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const tileRefs = useRef<Record<number, HTMLDivElement | null>>({});

  async function handlePick(optionIndex: number) {
    const svg = tileRefs.current[optionIndex]?.querySelector("svg");
    if (!svg) return;

    setSelecting(optionIndex);
    try {
      const blob = await svgElementToPngBlob(svg, EXPORT_SIZE);
      await onSelect(blob);
    } finally {
      setSelecting(null);
    }
  }

  if (!variant) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {BORING_AVATAR_VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => setVariant(v)}
            className="flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/10"
          >
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full">
              <BoringAvatar size={PREVIEW_SIZE} name={seed} variant={v} colors={BORING_AVATAR_COLORS} />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{VARIANT_LABELS[v]}</span>
          </button>
        ))}
      </div>
    );
  }

  const options = Array.from({ length: BORING_AVATAR_OPTION_COUNT }, (_, index) => `${seed}-${index}`);

  return (
    <div>
      <button
        type="button"
        onClick={() => setVariant(null)}
        disabled={selecting !== null}
        className="mb-3 flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconArrowLeft size={16} stroke={1.75} />
        {VARIANT_LABELS[variant]}
      </button>
      <div className="grid grid-cols-4 gap-3">
        {options.map((optionSeed, index) => (
          <button
            key={optionSeed}
            type="button"
            disabled={disabled || selecting !== null}
            onClick={() => handlePick(index)}
            className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/10"
          >
            <div
              ref={(node) => {
                tileRefs.current[index] = node;
              }}
              className={cn(
                "relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full",
                selecting === index && "opacity-50",
              )}
            >
              <BoringAvatar size={PREVIEW_SIZE} name={optionSeed} variant={variant} colors={BORING_AVATAR_COLORS} />
              {selecting === index && <IconLoader2 className="absolute animate-spin text-white" size={20} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
