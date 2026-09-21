"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconArrowForwardUp, IconCornerUpLeft, IconPencil, IconTrash, IconCopy, IconPhoto } from "@tabler/icons-react";
import { QUICK_EMOJIS } from "./QuickReactionPicker";
import { cn } from "@/utils/cn";

interface MessageOptionsMenuProps {
  open: boolean;
  onClose: () => void;
  canReply: boolean;
  canForward: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCopyText?: boolean;
  canCopyImage?: boolean;
  selectedText?: string | null;
  onReply: () => void;
  onForward: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyText?: () => void;
  onCopySelectedText?: (text: string) => void;
  onCopyImage?: () => void;
  onSelectReaction?: (emoji: string) => void;
  align: "left" | "right";
  /** Coordenadas de pantalla del cursor si se abrió por click derecho (contextmenu).
   * Si está presente, el menú se posiciona con fixed calculando el espacio disponible en viewport. */
  anchorPosition?: { x: number; y: number } | null;
}

/** Mismo patrón que ConversationOptionsMenu.tsx: panel absoluto o fixed con
 * cálculo inteligente de espacio disponible para nunca salirse de la pantalla
 * ni generar scroll en mensajes recientes (al fondo del chat). */
export function MessageOptionsMenu({
  open,
  onClose,
  canReply,
  canForward,
  canEdit,
  canDelete,
  canCopyText = false,
  canCopyImage = false,
  selectedText = null,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onCopyText,
  onCopySelectedText,
  onCopyImage,
  onSelectReaction,
  align,
  anchorPosition = null,
}: MessageOptionsMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [verticalPlacement, setVerticalPlacement] = useState<"down" | "up">("down");
  const [horizontalPlacement, setHorizontalPlacement] = useState<"left" | "right">(align);

  // Calcular coordenadas fijas si se abrió con click derecho
  const MENU_WIDTH = 176;
  const MENU_HEIGHT = 240;

  let fixedCoords: { x: number; y: number } | null = null;
  if (anchorPosition && typeof window !== "undefined") {
    let x = anchorPosition.x;
    let y = anchorPosition.y;

    // Si se pasa del borde inferior, mostrar hacia arriba
    if (y + MENU_HEIGHT > window.innerHeight - 16) {
      y = Math.max(16, y - MENU_HEIGHT);
    }
    // Si se pasa del borde derecho, mostrar hacia la izquierda
    if (x + MENU_WIDTH > window.innerWidth - 16) {
      x = Math.max(16, x - MENU_WIDTH);
    }
    fixedCoords = { x, y };
  }

  // Si se abrió por el botón "⋮" (sin anchorPosition), calcular espacio relativo al trigger y scroll container
  useLayoutEffect(() => {
    if (!open || anchorPosition || !containerRef.current) return;

    const updatePlacement = () => {
      const el = containerRef.current;
      if (!el) return;

      const parent = el.parentElement;
      const parentRect = parent ? parent.getBoundingClientRect() : el.getBoundingClientRect();
      const menuHeight = el.offsetHeight || 220;
      const menuWidth = el.offsetWidth || 176;

      // Buscar el contenedor scrollable (MessageList) si existe
      const scrollContainer = el.closest(".overflow-y-auto");
      const bottomLimit = scrollContainer
        ? Math.min(window.innerHeight, scrollContainer.getBoundingClientRect().bottom)
        : window.innerHeight;
      const topLimit = scrollContainer
        ? Math.max(0, scrollContainer.getBoundingClientRect().top)
        : 0;

      const spaceBelow = bottomLimit - parentRect.bottom;
      const spaceAbove = parentRect.top - topLimit;

      // Si no cabe abajo y hay más espacio arriba, abrir hacia arriba (evita desborde y scroll en chats recientes)
      if (spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow) {
        setVerticalPlacement("up");
      } else {
        setVerticalPlacement("down");
      }

      // Horizontal: verificar si desborda la pantalla
      if (align === "right") {
        const leftEdge = parentRect.right - menuWidth;
        if (leftEdge < 16) {
          setHorizontalPlacement("left");
        } else {
          setHorizontalPlacement("right");
        }
      } else {
        const rightEdge = parentRect.left + menuWidth;
        if (rightEdge > window.innerWidth - 16) {
          setHorizontalPlacement("right");
        } else {
          setHorizontalPlacement("left");
        }
      }
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [open, align, anchorPosition]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, onClose]);

  if (
    !open ||
    (!canReply && !canForward && !canEdit && !canDelete && !canCopyText && !canCopyImage && !onSelectReaction)
  ) {
    return null;
  }

  const isFixed = Boolean(fixedCoords);

  return (
    <div
      ref={containerRef}
      role="menu"
      style={
        isFixed
          ? {
              position: "fixed",
              left: `${fixedCoords!.x}px`,
              top: `${fixedCoords!.y}px`,
              zIndex: 50,
            }
          : undefined
      }
      className={cn(
        "w-44 overflow-hidden rounded-lg border border-black/5 bg-white py-1 text-left shadow-lg dark:border-white/10 dark:bg-neutral-900",
        !isFixed && [
          "absolute z-20",
          verticalPlacement === "up" ? "bottom-full mb-1" : "top-full mt-1",
          horizontalPlacement === "right" ? "right-0" : "left-0",
        ],
      )}
    >
      {onSelectReaction && (
        <div className="flex items-center justify-between border-b border-black/5 px-2 py-1.5 dark:border-white/10">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onClose();
                onSelectReaction(emoji);
              }}
              aria-label={`Reaccionar con ${emoji}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-sm transition-transform hover:scale-130 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {canReply && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onReply();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconCornerUpLeft size={16} stroke={1.75} />
          Responder
        </button>
      )}
      {canForward && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onForward();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconArrowForwardUp size={16} stroke={1.75} />
          Reenviar
        </button>
      )}
      {canCopyText && Boolean(selectedText && selectedText.trim()) && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onCopySelectedText?.(selectedText!.trim());
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconCopy size={16} stroke={1.75} />
          Copiar texto seleccionado
        </button>
      )}
      {canCopyText && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onCopyText?.();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconCopy size={16} stroke={1.75} />
          {Boolean(selectedText && selectedText.trim())
            ? "Copiar todo el mensaje"
            : canCopyImage
            ? "Copiar texto"
            : "Copiar"}
        </button>
      )}
      {canCopyImage && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onCopyImage?.();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconPhoto size={16} stroke={1.75} />
          Copiar imagen
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onEdit();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconPencil size={16} stroke={1.75} />
          Editar
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onDelete();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <IconTrash size={16} stroke={1.75} />
          Eliminar para todos
        </button>
      )}
    </div>
  );
}
