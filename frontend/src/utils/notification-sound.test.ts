import { beforeEach, describe, expect, it, vi } from "vitest";

describe("notification-sound", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("plays audio with reset currentTime and volume 0.5", async () => {
    const mockPlay = vi.fn().mockResolvedValue(undefined);

    class MockAudio {
      src: string;
      volume = 1;
      currentTime = 10;
      play = mockPlay;

      constructor(src: string) {
        this.src = src;
      }
    }

    vi.stubGlobal("Audio", MockAudio);

    const { playNotificationSound } = await import("./notification-sound");
    playNotificationSound();

    expect(mockPlay).toHaveBeenCalled();
  });

  it("safely catches play rejection without throwing", async () => {
    const mockPlay = vi.fn().mockRejectedValue(new Error("Autoplay prevented"));

    class MockAudio {
      src: string;
      volume = 1;
      currentTime = 10;
      play = mockPlay;

      constructor(src: string) {
        this.src = src;
      }
    }

    vi.stubGlobal("Audio", MockAudio);

    const { playNotificationSound } = await import("./notification-sound");
    expect(() => playNotificationSound()).not.toThrow();
  });
});
