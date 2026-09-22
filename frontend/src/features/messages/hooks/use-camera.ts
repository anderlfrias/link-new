"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "ready" | "captured" | "error";
export type CameraFacingMode = "user" | "environment";

export interface UseCameraReturn {
  status: CameraStatus;
  error: string | null;
  stream: MediaStream | null;
  facingMode: CameraFacingMode;
  capturedBlob: Blob | null;
  capturedUrl: string | null;
  startCamera: (facing?: CameraFacingMode) => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  capture: (videoElement: HTMLVideoElement | null) => Promise<Blob | null>;
  retake: () => Promise<void>;
  confirmPhoto: (fileName?: string) => File | null;
}

export function useCamera(): UseCameraReturn {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const capturedUrlRef = useRef<string | null>(null);

  // Mantener refs sincronizadas para cleanup
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    capturedUrlRef.current = capturedUrl;
  }, [capturedUrl]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const startCamera = useCallback(
    async (facing: CameraFacingMode = facingMode) => {
      stopCamera();
      setError(null);
      setStatus("requesting");

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setError("Tu navegador o dispositivo no soporta acceso a la cámara.");
        setStatus("error");
        return;
      }

      try {
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facing,
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          // Fallback a video básico si las restricciones específicas de resolución fallan
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setFacingMode(facing);
        setStatus("ready");
      } catch (err) {
        const errorObj = err as { name?: string; message?: string };
        let msg = "No se pudo acceder a la cámara.";
        if (
          errorObj.name === "NotAllowedError" ||
          errorObj.name === "PermissionDeniedError"
        ) {
          msg = "Permiso denegado para acceder a la cámara. Habilitalo en los permisos del navegador.";
        } else if (
          errorObj.name === "NotFoundError" ||
          errorObj.name === "DevicesNotFoundError"
        ) {
          msg = "No se encontró ninguna cámara conectada en tu dispositivo.";
        }
        setError(msg);
        setStatus("error");
      }
    },
    [facingMode, stopCamera],
  );

  const switchCamera = useCallback(async () => {
    const nextFacing: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    await startCamera(nextFacing);
  }, [facingMode, startCamera]);

  const capture = useCallback(
    async (videoElement: HTMLVideoElement | null): Promise<Blob | null> => {
      if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) return null;

      // Si es cámara frontal (selfie), espejar horizontalmente para vista natural
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        if (canvas.toBlob) {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
        } else {
          resolve(null);
        }
      });

      if (blob) {
        // Limpiar URL previa si existía
        if (capturedUrlRef.current) {
          URL.revokeObjectURL(capturedUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedUrl(url);
        setStatus("captured");
        // Apagar cámara en vivo para ahorrar batería y apagar el sensor
        stopCamera();
        return blob;
      }

      return null;
    },
    [facingMode, stopCamera],
  );

  const retake = useCallback(async () => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
    }
    setCapturedBlob(null);
    setCapturedUrl(null);
    await startCamera(facingMode);
  }, [facingMode, startCamera]);

  const confirmPhoto = useCallback(
    (fileName?: string): File | null => {
      if (!capturedBlob) return null;
      const name = fileName || `foto_camara_${Date.now()}.jpg`;
      return new File([capturedBlob], name, { type: "image/jpeg" });
    },
    [capturedBlob],
  );

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (capturedUrlRef.current) {
        URL.revokeObjectURL(capturedUrlRef.current);
      }
    };
  }, []);

  return {
    status,
    error,
    stream,
    facingMode,
    capturedBlob,
    capturedUrl,
    startCamera,
    stopCamera,
    switchCamera,
    capture,
    retake,
    confirmPhoto,
  };
}
