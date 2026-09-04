"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";

interface UseMessageGesturesOptions {
  /** Abre el menú de opciones (mobile) — mismo criterio que antes (`useLongPress`). */
  onLongPress: () => void;
  /** Selecciona el mensaje para responder al completar el swipe (mobile). */
  onSwipeReply: () => void;
  /** Ej. mensaje borrado: ni long-press ni swipe deben hacer nada. */
  disabled?: boolean;
  longPressDelay?: number;
  /** Umbral de movimiento (px) que descarta el long-press y decide si el
   * gesto es un swipe horizontal o un scroll vertical normal del hilo. */
  moveThreshold?: number;
  /** Cuánto hay que arrastrar a la derecha para que, al soltar, dispare "responder". */
  swipeThreshold?: number;
  /** Tope visual del desplazamiento — un swipe más largo no mueve la burbuja más allá de esto. */
  maxSwipeOffset?: number;
}

/**
 * Long-press (abre el menú "Responder"/"Editar"/"Eliminar") y swipe-a-la-derecha
 * (selecciona directamente para responder, mismo gesto que WhatsApp mobile) sobre
 * la MISMA burbuja — no pueden vivir en dos hooks de touch independientes: un
 * elemento solo puede tener un `onTouchStart`/`onTouchMove`/`onTouchEnd`, y ambos
 * gestos necesitan decidir juntos, en el primer movimiento, cuál de los dos está
 * pasando (o si es simplemente un scroll vertical del hilo, que no debe tocarse).
 */
export function useMessageGestures({
  onLongPress,
  onSwipeReply,
  disabled = false,
  longPressDelay = 500,
  moveThreshold = 10,
  swipeThreshold = 56,
  maxSwipeOffset = 72,
}: UseMessageGesturesOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modeRef = useRef<"pending" | "swiping" | "cancelled">("cancelled");
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (disabled) return;
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
      modeRef.current = "pending";
      timerRef.current = setTimeout(() => {
        if (modeRef.current !== "pending") return;
        modeRef.current = "cancelled";
        onLongPress();
      }, longPressDelay);
    },
    [disabled, longPressDelay, onLongPress],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!startRef.current || modeRef.current === "cancelled") return;
      const touch = event.touches[0];
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;

      if (modeRef.current === "pending") {
        if (Math.abs(dx) <= moveThreshold && Math.abs(dy) <= moveThreshold) return;
        // Ya se movió lo suficiente como para no ser un long-press quieto.
        clearTimer();
        // Solo hacia la derecha y predominantemente horizontal — si no, es un
        // scroll vertical normal del hilo, se deja pasar sin tocar nada.
        modeRef.current = dx > moveThreshold && Math.abs(dx) > Math.abs(dy) * 1.5 ? "swiping" : "cancelled";
        if (modeRef.current === "swiping") setIsSwiping(true);
      }

      if (modeRef.current === "swiping") {
        setSwipeOffset(Math.max(0, Math.min(dx, maxSwipeOffset)));
      }
    },
    [clearTimer, maxSwipeOffset, moveThreshold],
  );

  const onTouchEnd = useCallback(() => {
    clearTimer();
    if (modeRef.current === "swiping" && swipeOffset >= swipeThreshold) {
      onSwipeReply();
    }
    modeRef.current = "cancelled";
    startRef.current = null;
    setIsSwiping(false);
    setSwipeOffset(0);
  }, [clearTimer, onSwipeReply, swipeOffset, swipeThreshold]);

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    swipeOffset,
    isSwiping,
  };
}
