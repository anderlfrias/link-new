"use client";

import { useMemo, useState } from "react";
import { IconArrowLeft, IconCheck, IconDice, IconLoader2 } from "@tabler/icons-react";
import type { AvatarStyleDef } from "@/constants/avatar-catalog";
import { AVATAR_BACKGROUND_PALETTES } from "@/constants/avatar-catalog";
import { renderDiceBearDataUri, renderDiceBearSvg, svgStringToPngBlob } from "@/utils/dicebear-renderer";
import { getDiceBearAttribution } from "@/utils/dicebear-attribution";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";

interface AvatarCustomizerViewProps {
  styleDef: AvatarStyleDef;
  initialSeed: string;
  onBack: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
  disabled?: boolean;
}

export function AvatarCustomizerView({
  styleDef,
  initialSeed,
  onBack,
  onConfirm,
  disabled = false,
}: AvatarCustomizerViewProps) {
  const [seed, setSeed] = useState(initialSeed);
  const [selectedBg, setSelectedBg] = useState<string>("transparent");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);

  // Generar preview data uri
  const previewDataUri = useMemo(() => {
    return renderDiceBearDataUri(styleDef.style, {
      seed,
      backgroundColor: selectedBg,
      size: 192,
    });
  }, [styleDef, seed, selectedBg]);

  function handleRandomize() {
    setDiceRolling(true);
    // Cambiar la semilla agregando un timestamp o random string
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    setSeed(`${styleDef.id}-${randomSuffix}`);
    setTimeout(() => setDiceRolling(false), 400);
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      // Renderizar el SVG completo con la configuración actual
      const svgString = renderDiceBearSvg(styleDef.style, {
        seed,
        backgroundColor: selectedBg,
        size: 512,
      });

      // Convertir a PNG Blob a alta resolución (512x512)
      const pngBlob = await svgStringToPngBlob(svgString, 512);
      await onConfirm(pngBlob);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isActionDisabled = disabled || isSubmitting;
  // Algunos estilos son de terceros bajo CC BY 4.0: la licencia exige acreditar
  // título, autor, fuente y licencia donde se usa la obra (ver THIRD_PARTY_NOTICES.md).
  const attribution = getDiceBearAttribution(styleDef.style);

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Barra superior de navegación */}
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          disabled={isActionDisabled}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-brand-blue disabled:opacity-50 dark:text-neutral-300 dark:hover:text-brand-blue-light"
        >
          <IconArrowLeft size={18} stroke={2} />
          <span>Volver al catálogo</span>
        </button>

        <span className="text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          Estilo: {styleDef.name}
        </span>
      </div>

      {/* Cuerpo principal del personalizador */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Vista previa central circular grande (estilo Google) */}
        <div className="flex flex-col items-center">
          <div className="relative group">
            {/* Círculo del avatar con marco decorativo */}
            <div
              className={cn(
                "relative flex h-40 w-40 sm:h-44 sm:w-44 items-center justify-center overflow-hidden rounded-full border-4 border-white shadow-xl ring-1 ring-black/10 transition-all duration-300 dark:border-neutral-800 dark:ring-white/10",
                selectedBg === "transparent" && "bg-neutral-100 dark:bg-neutral-800",
              )}
              style={
                selectedBg !== "transparent"
                  ? { backgroundColor: `#${selectedBg.replace("#", "")}` }
                  : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewDataUri}
                alt={`Vista previa de avatar ${styleDef.name}`}
                className={cn(
                  "h-full w-full object-contain transition-transform duration-300",
                  diceRolling && "scale-90 opacity-70 rotate-6",
                )}
              />
            </div>

            {/* Botón flotante para generar otra variante */}
            <button
              type="button"
              onClick={handleRandomize}
              disabled={isActionDisabled}
              title="Generar otra variante de este estilo"
              className={cn(
                "absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue text-white shadow-lg transition-transform hover:scale-110 active:scale-95 disabled:opacity-50",
                diceRolling && "animate-spin",
              )}
            >
              <IconDice size={20} stroke={2} />
            </button>
          </div>

          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Tocá el dado para probar distintas expresiones y peinados
          </p>

          {attribution && (
            <p className="mt-2 max-w-xs text-center text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
              Adaptación de «
              <a
                href={attribution.source}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-brand-blue"
              >
                {attribution.title}
              </a>
              » de {attribution.creator}, bajo licencia{" "}
              <a
                href={attribution.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-brand-blue"
              >
                {attribution.licenseName}
              </a>
            </p>
          )}
        </div>

        {/* Selector de color de fondo */}
        <div className="rounded-xl border border-black/5 bg-neutral-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
          <label className="block text-xs font-semibold text-brand-ink uppercase tracking-wider dark:text-white mb-3">
            Color de fondo
          </label>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5">
            {AVATAR_BACKGROUND_PALETTES.map((color) => {
              const isSelected = selectedBg === color.hex;
              const isTransparent = color.hex === "transparent";

              return (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setSelectedBg(color.hex)}
                  disabled={isActionDisabled}
                  title={color.name}
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110",
                    isSelected ? "ring-2 ring-brand-blue ring-offset-2 dark:ring-offset-neutral-900" : "hover:opacity-90",
                    isTransparent && "border border-dashed border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800",
                  )}
                  style={
                    !isTransparent
                      ? { backgroundColor: `#${color.hex.replace("#", "")}` }
                      : undefined
                  }
                >
                  {isTransparent && !isSelected && (
                    <span className="text-[10px] font-bold text-neutral-400">Ø</span>
                  )}
                  {isSelected && (
                    <IconCheck
                      size={14}
                      stroke={3}
                      className={cn(
                        color.isLight || isTransparent ? "text-neutral-800" : "text-white",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pie de acciones fijas */}
      <div className="flex items-center justify-end gap-3 border-t border-black/5 bg-neutral-50/80 px-4 py-3 dark:border-white/10 dark:bg-neutral-900/80">
        <button
          type="button"
          onClick={onBack}
          disabled={isActionDisabled}
          className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-black/5 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          Cancelar
        </button>
        <Button
          type="button"
          disabled={isActionDisabled}
          onClick={handleSave}
          className="min-w-36"
        >
          {isSubmitting ? (
            <>
              <IconLoader2 size={16} className="animate-spin" />
              <span>Guardando...</span>
            </>
          ) : (
            <span>Aplicar avatar</span>
          )}
        </Button>
      </div>
    </div>
  );
}
