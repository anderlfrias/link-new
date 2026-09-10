import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUploadProgress, formatEta } from "./use-upload-progress";

describe("formatEta", () => {
  it("formatea segundos menores a un minuto", () => {
    expect(formatEta(45)).toBe("45 s");
    expect(formatEta(1)).toBe("1 s");
    expect(formatEta(0)).toBe("0 s");
  });

  it("formatea minutos y segundos", () => {
    expect(formatEta(125)).toBe("2 min 5 s");
    expect(formatEta(60)).toBe("1 min");
    expect(formatEta(600)).toBe("10 min");
  });

  it("formatea horas y minutos", () => {
    expect(formatEta(3600)).toBe("1 h");
    expect(formatEta(3665)).toBe("1 h 1 min");
    expect(formatEta(7200)).toBe("2 h");
  });
});

describe("useUploadProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("inicializa con porcentaje 0 y sin ETA al arrancar", () => {
    const { result } = renderHook(() =>
      useUploadProgress({
        loadedBytes: 0,
        totalBytes: 100 * 1024 * 1024,
        isUploading: false,
      }),
    );

    expect(result.current.percentage).toBe(0);
    expect(result.current.speedBytesPerSec).toBe(0);
    expect(result.current.speedFormatted).toBeNull();
    expect(result.current.etaSeconds).toBeNull();
    expect(result.current.etaFormatted).toBeNull();
  });

  it("suprime el ETA durante los primeros 3 segundos de subida (§8.4)", () => {
    const totalBytes = 100 * 1024 * 1024; // 100 MiB

    const { result, rerender } = renderHook(
      (props) => useUploadProgress(props),
      {
        initialProps: {
          loadedBytes: 0,
          totalBytes,
          isUploading: true,
        },
      },
    );

    // Muestra 1 a los 1000ms: 10 MiB cargados
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender({
      loadedBytes: 10 * 1024 * 1024,
      totalBytes,
      isUploading: true,
    });

    expect(result.current.percentage).toBe(10);
    expect(result.current.speedBytesPerSec).toBeGreaterThan(0);
    // ETA debe seguir siendo null porque transcurrió < 3000ms
    expect(result.current.etaSeconds).toBeNull();
    expect(result.current.etaFormatted).toBeNull();

    // Muestra 2 a los 2000ms: 20 MiB cargados
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender({
      loadedBytes: 20 * 1024 * 1024,
      totalBytes,
      isUploading: true,
    });

    expect(result.current.etaSeconds).toBeNull();

    // Muestra 3 a los 3500ms (supera los 3 segundos de estabilización): 35 MiB cargados
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    rerender({
      loadedBytes: 35 * 1024 * 1024,
      totalBytes,
      isUploading: true,
    });

    // Ahora el ETA debe estar presente
    expect(result.current.etaSeconds).not.toBeNull();
    expect(result.current.etaSeconds).toBeGreaterThan(0);
    expect(result.current.etaFormatted).toBeTruthy();
    expect(result.current.speedFormatted).toBeTruthy();
  });

  it("resetea velocidad y ETA cuando isUploading pasa a false", () => {
    const totalBytes = 10 * 1024 * 1024;

    const { result, rerender } = renderHook(
      (props) => useUploadProgress(props),
      {
        initialProps: {
          loadedBytes: 0,
          totalBytes,
          isUploading: true,
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    rerender({
      loadedBytes: 8 * 1024 * 1024,
      totalBytes,
      isUploading: true,
    });

    expect(result.current.etaSeconds).not.toBeNull();

    rerender({
      loadedBytes: 8 * 1024 * 1024,
      totalBytes,
      isUploading: false,
    });

    expect(result.current.speedBytesPerSec).toBe(0);
    expect(result.current.etaSeconds).toBeNull();
    expect(result.current.etaFormatted).toBeNull();
  });
});
