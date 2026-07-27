"use client";

import { useState } from "react";
import { cn } from "@/utils/cn";

/** Variaciones sobre la paleta de marca — sin colores ajenos al branding de Link. */
const PALETTE = ["bg-brand-blue", "bg-brand-teal", "bg-brand-blue-dark", "bg-brand-teal-dark", "bg-brand-ink"];

function hashToIndex(input: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

interface AvatarProps {
  name: string;
  /** Si se rompe la carga, cae solo a las iniciales — no hace falta manejarlo desde afuera. */
  imageUrl?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function Avatar({ name, imageUrl, size = "md", className }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const trimmed = name.trim();

  if (imageUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={trimmed}
        onError={() => setImageFailed(true)}
        className={cn("inline-flex shrink-0 rounded-full object-cover", SIZE_CLASSES[size], className)}
      />
    );
  }

  const initial = trimmed.charAt(0).toUpperCase() || "?";
  const color = PALETTE[hashToIndex(trimmed || "?", PALETTE.length)];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        SIZE_CLASSES[size],
        color,
        className,
      )}
    >
      {initial}
    </span>
  );
}
