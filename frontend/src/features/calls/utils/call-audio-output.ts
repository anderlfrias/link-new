/**
 * Selección de la salida de audio en celulares: auricular (llamada de voz, se lleva al oído),
 * altavoz (videollamada, se mira la pantalla) u otras salidas (Bluetooth, auriculares).
 *
 * La web no permite forzar el ruteo: lo hace el SO. Lo único disponible es:
 *  - `navigator.audioSession` (Safari/iOS): declara que es audio de comunicación.
 *  - `HTMLMediaElement.setSinkId` + `enumerateDevices` (Chromium/Android): elegir una salida.
 * Si el navegador no expone `setSinkId` (ej. iOS) o hay menos de 2 salidas, no se ofrece el
 * selector y manda el comportamiento por defecto del navegador/SO.
 */
export type OutputKind = "earpiece" | "speaker" | "other";

export interface OutputDevice {
  id: string;
  label: string;
  kind: OutputKind;
}

type SinkElement = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

const EARPIECE_RE = /earpiece|receiver|handset|auricular/i;
const SPEAKER_RE = /speaker|altavoz|altavoces|bocina/i;

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS reporta "Macintosh" pero tiene pantalla táctil
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Declara el audio de la página como de comunicación (Safari). No-op si no existe. */
export function enableCommunicationAudioSession(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "play-and-record";
  } catch {
    // no soportado: se ignora
  }
}

export function classifyOutput(label: string): OutputKind {
  if (EARPIECE_RE.test(label)) return "earpiece";
  if (SPEAKER_RE.test(label)) return "speaker";
  return "other";
}

/** Lista las salidas de audio disponibles (vacía si no hay permiso/etiquetas o falla). */
export async function listOutputDevices(): Promise<OutputDevice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const outputs = all.filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications");
    // "default" es un alias de otra salida: solo se conserva si es la única
    const real = outputs.filter((d) => d.deviceId !== "default");
    const chosen = real.length > 0 ? real : outputs;
    return chosen.map((d) => ({
      id: d.deviceId,
      label: d.label || d.deviceId,
      kind: classifyOutput(d.label),
    }));
  } catch {
    return [];
  }
}

export function supportsOutputSelection(el: HTMLMediaElement | null): boolean {
  return !!el && typeof (el as SinkElement).setSinkId === "function";
}

/** Dirige el audio del elemento a esa salida. false si no se pudo (queda el default del navegador). */
export async function applyAudioOutput(el: HTMLMediaElement, deviceId: string): Promise<boolean> {
  if (!supportsOutputSelection(el)) return false;
  try {
    await (el as SinkElement).setSinkId!(deviceId);
    return true;
  } catch {
    return false;
  }
}

/** Salida inicial según el tipo de llamada: voz → auricular, video → altavoz (null = default del SO). */
export function defaultOutputFor(isVideoCall: boolean, devices: OutputDevice[]): string | null {
  const wanted: OutputKind = isVideoCall ? "speaker" : "earpiece";
  return devices.find((d) => d.kind === wanted)?.id ?? null;
}
