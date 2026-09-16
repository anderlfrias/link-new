import { describe, expect, it } from "vitest";
import { getLogger, getRequestMeta } from "../config/request-context";
import { logger } from "../config/logger";
import { runWorkerTick } from "./worker-context";

describe("runWorkerTick", () => {
  it("dentro de fn, getLogger() no es el logger raíz", async () => {
    let captured: unknown;
    await runWorkerTick("test-worker", async () => {
      captured = getLogger();
    });

    expect(captured).not.toBe(logger);
  });

  it("dentro de fn, getRequestMeta() devuelve {} (sin IP ni actor)", async () => {
    let captured: unknown;
    await runWorkerTick("test-worker", async () => {
      captured = getRequestMeta();
    });

    expect(captured).toEqual({});
  });

  it("dos llamadas seguidas generan tickId distintos", async () => {
    let firstTickId: unknown;
    let secondTickId: unknown;

    await runWorkerTick("test-worker", async () => {
      firstTickId = getLogger().bindings().tickId;
    });
    await runWorkerTick("test-worker", async () => {
      secondTickId = getLogger().bindings().tickId;
    });

    expect(firstTickId).toBeDefined();
    expect(secondTickId).toBeDefined();
    expect(firstTickId).not.toBe(secondTickId);
  });

  it("si fn rechaza, la promesa de runWorkerTick rechaza (no se traga el error)", async () => {
    const boom = new Error("boom");

    await expect(
      runWorkerTick("test-worker", async () => {
        throw boom;
      }),
    ).rejects.toThrow(boom);
  });

  it("el logger del contexto lleva worker y tickId, y NUNCA requestId", async () => {
    let bindings: Record<string, unknown> = {};
    await runWorkerTick("message-retention", async () => {
      bindings = getLogger().bindings();
    });

    expect(bindings.worker).toBe("message-retention");
    expect(bindings.tickId).toEqual(expect.any(String));
    expect(Object.keys(bindings).sort()).toEqual(["tickId", "worker"]);
    expect(bindings).not.toHaveProperty("requestId");
  });
});
