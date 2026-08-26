"use client";

import { useCallback, useRef, type TouchEvent } from "react";

interface UseLongPressOptions {
  delay?: number;
  /** Umbral de movimiento (px) que cancela el long-press — distingue de un scroll. */
  moveThreshold?: number;
}

/** Long-press táctil genérico (mobile) — no maneja mouse, en desktop la
 * interacción equivalente es un botón explícito, no long-press. */
export function useLongPress(onLongPress: () => void, { delay = 500, moveThreshold = 10 }: UseLongPressOptions = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
  }, []);

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      const touch = event.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      firedRef.current = false;
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!startPos.current) return;
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - startPos.current.x);
      const dy = Math.abs(touch.clientY - startPos.current.y);
      // Se movió más que un toque tembloroso — era un scroll, no un long-press.
      if (dx > moveThreshold || dy > moveThreshold) {
        clear();
      }
    },
    [clear, moveThreshold],
  );

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (firedRef.current) {
        // El long-press ya disparó (abrió el menú) — frenar el click/navegación
        // sintética que el <Link> de la fila dispararía a continuación.
        event.preventDefault();
      }
      clear();
    },
    [clear],
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
