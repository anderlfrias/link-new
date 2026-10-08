import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../config/prisma";
import { DATABASE_CHECK_TIMEOUT_MS, checkDatabase } from "./health.service";

describe("health.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkDatabase", () => {
    it("devuelve true si la base responde a la consulta", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as any);

      await expect(checkDatabase()).resolves.toBe(true);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("devuelve false, sin lanzar, si la consulta falla", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Can't reach database server"));

      await expect(checkDatabase()).resolves.toBe(false);
    });

    it("devuelve false pasado el tope si la base nunca responde", async () => {
      vi.useFakeTimers();
      vi.mocked(prisma.$queryRaw).mockReturnValue(new Promise(() => {}) as any);

      const result = checkDatabase(1000);
      await vi.advanceTimersByTimeAsync(999);
      // Todavía dentro del tope: sigue esperando.
      let settled = false;
      void result.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe(false);
    });

    it("no deja un temporizador pendiente cuando la base responde", async () => {
      vi.useFakeTimers();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

      await checkDatabase();

      expect(vi.getTimerCount()).toBe(0);
    });

    it("el tope por defecto es menor que el timeout del HEALTHCHECK de Docker (5 s)", () => {
      expect(DATABASE_CHECK_TIMEOUT_MS).toBeLessThan(5000);
    });
  });
});
