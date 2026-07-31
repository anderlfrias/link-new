"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderStatus = "idle" | "recording" | "error";

/**
 * Graba audio del micrófono con `MediaRecorder` — sin subir nada, eso lo hace
 * quien llame a `stop()` con el `File` resultante (ver `MessageInput.tsx`,
 * que lo sube y lo manda como una nota de voz apenas termina de grabar, sin
 * pasar por la cola normal de adjuntos).
 */
export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cleanup() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  // Si el componente se desmonta a mitad de una grabación (ej. cambiaste de
  // conversación), sin esto el micrófono se queda prendido: nada más volvería
  // a llamar a `cleanup()`.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start();

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus("recording");
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
    } catch {
      // Permiso denegado, sin micrófono, etc.
      setStatus("error");
    }
  }, []);

  /** Termina de grabar y devuelve el audio como `File` (o `null` si no se
   * grabó nada, ej. se soltó casi de inmediato). */
  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        cleanup();
        setStatus("idle");
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        resolve(new File([blob], `nota-de-voz.${extension}`, { type: mimeType }));
      };
      recorder.stop();
    });
  }, []);

  /** Descarta la grabación en curso sin devolver nada. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Sin este null, el onstop que ya haya quedado de un `stop()` previo
      // (no debería, pero por las dudas) dispararía su resolve también acá.
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    chunksRef.current = [];
    setStatus("idle");
  }, []);

  return { status, elapsedMs, start, stop, cancel };
}
