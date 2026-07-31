"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { IconDownload, IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { downloadFile } from "@/utils/download-file";
import { formatDuration } from "@/utils/format-duration";
import { cn } from "@/utils/cn";

interface VoiceNotePlayerProps {
  url: string;
  filename: string;
  isOwn: boolean;
}

/** Reproductor propio para adjuntos de audio (notas de voz grabadas acá, o
 * cualquier archivo de audio) — reemplaza el `<audio controls>` nativo, que
 * se ve genérico y no combina con el resto de la burbuja. */
export function VoiceNotePlayer({ url, filename, isOwn }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const resolvingDurationRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function resolveDuration() {
      if (!audio) return;
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
        return;
      }
      // Chrome no calcula la duración real de un webm grabado con
      // MediaRecorder hasta que se busca cerca del final una vez — sin esto
      // queda en `Infinity` para siempre (ver nota de voz recién grabada).
      // `resolvingDurationRef` evita que el `timeupdate` que dispara este seek
      // muestre por un instante la posición "al final" antes de resetearla.
      resolvingDurationRef.current = true;
      function handleDurationChange() {
        if (!audio || !Number.isFinite(audio.duration)) return;
        audio.currentTime = 0;
        setDuration(audio.duration);
        resolvingDurationRef.current = false;
        audio.removeEventListener("durationchange", handleDurationChange);
      }
      audio.addEventListener("durationchange", handleDurationChange);
      audio.currentTime = 1e10;
    }

    function handleTimeUpdate() {
      if (audio && !resolvingDurationRef.current) setCurrentTime(audio.currentTime);
    }
    function handleEnded() {
      setPlaying(false);
      setCurrentTime(0);
    }

    audio.addEventListener("loadedmetadata", resolveDuration);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", resolveDuration);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  function handleSeek(event: ReactMouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const time = ratio * duration;
    audio.currentTime = time;
    setCurrentTime(time);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const timeLabel = formatDuration((playing || currentTime > 0 ? currentTime : duration) * 1000);

  return (
    <div className="flex w-56 max-w-full items-center gap-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pausar nota de voz" : "Reproducir nota de voz"}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          isOwn ? "bg-white/25 hover:bg-white/35" : "bg-brand-blue text-white hover:bg-brand-blue-dark",
        )}
      >
        {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} className="ml-0.5" />}
      </button>

      <div className="relative flex min-w-0 flex-1 h-9 items-center">
        <div
          onClick={handleSeek}
          role="slider"
          aria-label="Posición de la nota de voz"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          className={cn(
            "relative h-1.5 w-full cursor-pointer rounded-full",
            isOwn ? "bg-white/30" : "bg-black/10 dark:bg-white/15",
          )}
        >
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", isOwn ? "bg-white" : "bg-brand-blue")}
            style={{ width: `${progress}%` }}
          />
          <div
            className={cn(
              "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow",
              isOwn ? "bg-white" : "bg-brand-blue",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className={cn("absolute bottom-0 left-0 text-[10px] leading-none tabular-nums", isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500")}>
          {timeLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={() => downloadFile(url, filename)}
        aria-label={`Descargar ${filename}`}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
          isOwn ? "hover:bg-white/20" : "hover:bg-black/5 dark:hover:bg-white/10",
        )}
      >
        <IconDownload size={14} className="opacity-70" />
      </button>
    </div>
  );
}
