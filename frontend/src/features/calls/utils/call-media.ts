import type { CallError, CallType } from "../types/call.types";

/**
 * Qué le falta al usuario para participar con su propia media.
 * - "no-mic": no hay micrófono → escucha, pero no habla.
 * - "no-camera": no hay cámara → habla, pero no envía video.
 * - "no-devices": no hay ni micrófono ni cámara → solo escucha/ve.
 */
export type MediaWarning = "no-mic" | "no-camera" | "no-devices";

export interface AcquiredMedia {
  /** null = no hay ningún dispositivo: la llamada sigue en modo solo-recepción. */
  stream: MediaStream | null;
  warning: MediaWarning | null;
}

/** Error de acceso a medios ya clasificado, listo para mostrarse al usuario. */
export class MediaAccessError extends Error {
  constructor(public readonly kind: CallError, cause?: unknown) {
    super(`media access failed: ${kind}`);
    this.name = "MediaAccessError";
    this.cause = cause;
  }
}

/** Traduce el error de getUserMedia (DOMException) a un CallError de la UI. */
export function classifyMediaError(err: unknown): CallError {
  if (err instanceof MediaAccessError) return err.kind;
  const name = (err as { name?: string } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in-use";
    default:
      return "media";
  }
}

function isMissingDevice(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError";
}

/**
 * Pide micrófono (y cámara en videollamadas) degradando cuando el equipo no tiene
 * alguno de los dispositivos, en vez de abortar la llamada:
 *   audio+video → solo audio ("no-camera") → solo video ("no-mic") → nada ("no-devices").
 * Permisos denegados o dispositivo ocupado NO degradan: es una decisión/estado del usuario
 * y se propaga como MediaAccessError para informarlo.
 */
export async function acquireLocalMedia(type: CallType): Promise<AcquiredMedia> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) {
    // Contexto no seguro (HTTP fuera de localhost): el navegador no expone la API.
    throw new MediaAccessError("insecure");
  }

  const attempt = async (constraints: MediaStreamConstraints): Promise<MediaStream | null> => {
    try {
      return await md.getUserMedia(constraints);
    } catch (err) {
      if (isMissingDevice(err)) return null;
      throw new MediaAccessError(classifyMediaError(err), err);
    }
  };

  const wantsVideo = type === "VIDEO";
  const full = await attempt({ audio: true, video: wantsVideo });
  if (full) return { stream: full, warning: null };

  if (wantsVideo) {
    const audioOnly = await attempt({ audio: true, video: false });
    if (audioOnly) return { stream: audioOnly, warning: "no-camera" };
    const videoOnly = await attempt({ audio: false, video: true });
    if (videoOnly) return { stream: videoOnly, warning: "no-mic" };
    return { stream: null, warning: "no-devices" };
  }

  return { stream: null, warning: "no-mic" };
}
