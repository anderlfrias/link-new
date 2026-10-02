"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyAudioOutput,
  defaultOutputFor,
  enableCommunicationAudioSession,
  isMobileDevice,
  listOutputDevices,
  supportsOutputSelection,
  type OutputDevice,
} from "../utils/call-audio-output";

interface Options {
  /** Hay una llamada con audio remoto reproduciéndose. */
  active: boolean;
  isVideoCall: boolean;
  /** Elemento <audio>/<video> que reproduce el stream remoto. */
  getElement: () => HTMLMediaElement | null;
  /** Cambia cuando se re-adjunta el stream remoto (para re-aplicar la salida). */
  streamKey: unknown;
}

/**
 * Selector de salida de audio para celulares. Por defecto: llamada de voz → auricular,
 * videollamada → altavoz; el usuario puede elegir otra (altavoz, Bluetooth, etc.).
 * `available` es false si el navegador no permite elegir salida o hay menos de 2:
 * en ese caso no se ofrece el control y manda el ruteo por defecto del SO.
 */
export function useAudioRoute({ active, isVideoCall, getElement, streamKey }: Options) {
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  // null = automático (según tipo de llamada); un id = elección manual del usuario
  const [chosenId, setChosenId] = useState<string | null>(null);

  // Cada llamada arranca en automático
  useEffect(() => {
    if (!active) setChosenId(null);
  }, [active]);

  // Detectar salidas disponibles (las etiquetas solo existen con permiso de media ya otorgado)
  // y refrescar cuando se conecta/desconecta un dispositivo (ej. Bluetooth).
  useEffect(() => {
    if (!active || !isMobileDevice()) {
      setDevices([]);
      return;
    }
    enableCommunicationAudioSession();
    let cancelled = false;
    const refresh = () => {
      void listOutputDevices().then((found) => {
        if (!cancelled) setDevices(found);
      });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [active, streamKey]);

  const available = devices.length >= 2 && supportsOutputSelection(getElement());
  const selectedId =
    chosenId && devices.some((d) => d.id === chosenId) ? chosenId : defaultOutputFor(isVideoCall, devices);

  useEffect(() => {
    const el = getElement();
    if (!available || !selectedId || !el) return;
    void applyAudioOutput(el, selectedId);
  }, [available, selectedId, streamKey, getElement]);

  const select = useCallback((id: string) => setChosenId(id), []);

  return { available, devices, selectedId, select };
}
