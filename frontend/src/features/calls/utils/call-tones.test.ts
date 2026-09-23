import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  playEndCallTone,
  playIncomingRingtone,
  playOutgoingRingtone,
  resetAudioContextForTesting,
  stopAllTones,
} from "./call-tones";

describe("call-tones", () => {
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockOscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContext = {
      state: "running",
      currentTime: 0,
      createOscillator: vi.fn(() => ({ ...mockOscillator })),
      createGain: vi.fn(() => ({ ...mockGain })),
      destination: {},
      resume: vi.fn(),
    };

    (window as any).AudioContext = vi.fn(function () {
      return mockAudioContext;
    });
  });

  afterEach(() => {
    resetAudioContextForTesting();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reproduce tono de llamada entrante y crea osciladores periódicamente", () => {
    playIncomingRingtone();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();

    // Avanzar tiempo para el intervalo de timbrado
    vi.advanceTimersByTime(3000);
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(4); // 2 por ráfaga
  });

  it("reproduce tono de llamada saliente", () => {
    playOutgoingRingtone();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
  });

  it("reproduce tono de fin de llamada", () => {
    playEndCallTone();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });

  it("detiene todos los tonos y limpia intervalos", () => {
    playIncomingRingtone();
    expect(() => stopAllTones()).not.toThrow();
  });
});
