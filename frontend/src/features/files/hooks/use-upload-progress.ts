"use client";

import { useEffect, useRef, useState } from "react";
import { formatFileSize } from "@/utils/file-format";

export interface UseUploadProgressInput {
  loadedBytes: number;
  totalBytes: number;
  isUploading: boolean;
}

export interface UseUploadProgressResult {
  percentage: number;
  speedBytesPerSec: number;
  speedFormatted: string | null;
  etaSeconds: number | null;
  etaFormatted: string | null;
}

/** Formatea segundos a una cadena legible en español (ej. "45 s", "2 min", "1 h 12 min"). */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";

  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    if (minutes < 5 && remainingSeconds > 0) {
      return `${minutes} min ${remainingSeconds} s`;
    }
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes > 0) {
    return `${hours} h ${remainingMinutes} min`;
  }
  return `${hours} h`;
}

const EMA_ALPHA = 0.25;
const ETA_STABILIZATION_MS = 3000; // §8.4: suprimir ETA los primeros 3 segundos

export function useUploadProgress({
  loadedBytes,
  totalBytes,
  isUploading,
}: UseUploadProgressInput): UseUploadProgressResult {
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const lastSampleRef = useRef<{ time: number; loaded: number } | null>(null);
  const speedRef = useRef(0);

  useEffect(() => {
    if (!isUploading || totalBytes <= 0) {
      startTimeRef.current = null;
      lastSampleRef.current = null;
      speedRef.current = 0;
      setSpeed(0);
      setEta(null);
      return;
    }

    const now = Date.now();

    if (!startTimeRef.current) {
      startTimeRef.current = now;
      lastSampleRef.current = { time: now, loaded: loadedBytes };
      return;
    }

    const last = lastSampleRef.current;
    if (!last) {
      lastSampleRef.current = { time: now, loaded: loadedBytes };
      return;
    }

    const elapsedMs = now - last.time;
    // Muestreo cada ~500ms para suavizar ráfagas
    if (elapsedMs < 500) return;

    const deltaBytes = Math.max(0, loadedBytes - last.loaded);
    const instantSpeed = (deltaBytes / elapsedMs) * 1000;

    const newSpeed =
      speedRef.current === 0
        ? instantSpeed
        : EMA_ALPHA * instantSpeed + (1 - EMA_ALPHA) * speedRef.current;

    speedRef.current = newSpeed;
    setSpeed(newSpeed);

    lastSampleRef.current = { time: now, loaded: loadedBytes };

    // Calcular ETA solo tras superar la ventana de estabilización (§8.4)
    const totalElapsedMs = now - startTimeRef.current;
    const remainingBytes = Math.max(0, totalBytes - loadedBytes);

    if (totalElapsedMs >= ETA_STABILIZATION_MS && newSpeed > 1024 && remainingBytes > 0) {
      const calculatedEta = Math.round(remainingBytes / newSpeed);
      setEta(calculatedEta);
    } else if (remainingBytes === 0) {
      setEta(0);
    } else {
      setEta(null);
    }
  }, [loadedBytes, totalBytes, isUploading]);

  const percentage =
    totalBytes <= 0 ? 0 : Math.min(100, Math.round((loadedBytes / totalBytes) * 100));

  const speedFormatted = speed > 100 ? `${formatFileSize(Math.round(speed))}/s` : null;
  const etaFormatted = eta !== null && eta > 0 ? formatEta(eta) : null;

  return {
    percentage,
    speedBytesPerSec: speed,
    speedFormatted,
    etaSeconds: eta,
    etaFormatted,
  };
}
