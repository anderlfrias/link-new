import { describe, expect, it } from "vitest";
import { logger as rootLogger } from "./logger";
import { bindContext, getLogger, getRequestMeta, runWithContext } from "./request-context";

describe("getLogger / getRequestMeta sin contexto", () => {
  it("getLogger() sin contexto devuelve el logger raíz", () => {
    expect(getLogger()).toBe(rootLogger);
  });

  it("getRequestMeta() sin contexto devuelve {}", () => {
    expect(getRequestMeta()).toEqual({});
  });
});

describe("runWithContext", () => {
  it("expone el logger y el meta pasados dentro de la función", () => {
    const child = rootLogger.child({ scope: "test" });
    const meta = { requestId: "req-1", ip: "127.0.0.1" };

    const result = runWithContext(child, meta, () => {
      expect(getLogger()).toBe(child);
      expect(getRequestMeta()).toEqual(meta);
      return "ok";
    });

    expect(result).toBe("ok");
  });

  it("el contexto sobrevive un await", async () => {
    const child = rootLogger.child({ scope: "async-test" });

    const result = await runWithContext(child, {}, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getLogger();
    });

    expect(result).toBe(child);
  });

  it("dos runWithContext concurrentes no se contaminan entre sí", async () => {
    const loggerA = rootLogger.child({ scope: "a" });
    const loggerB = rootLogger.child({ scope: "b" });

    const [resultA, resultB] = await Promise.all([
      runWithContext(loggerA, { requestId: "a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { logger: getLogger(), meta: getRequestMeta() };
      }),
      runWithContext(loggerB, { requestId: "b" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { logger: getLogger(), meta: getRequestMeta() };
      }),
    ]);

    expect(resultA.logger).toBe(loggerA);
    expect(resultA.meta.requestId).toBe("a");
    expect(resultB.logger).toBe(loggerB);
    expect(resultB.meta.requestId).toBe("b");
  });
});

describe("bindContext", () => {
  it("logFields afecta a los getLogger() posteriores del mismo contexto", () => {
    runWithContext(rootLogger.child({}), {}, () => {
      const before = getLogger();
      bindContext({ logFields: { userId: "user-1" } });
      const after = getLogger();
      expect(after).not.toBe(before);
    });
  });

  it("meta mergea sobre el meta existente, no lo reemplaza", () => {
    runWithContext(rootLogger.child({}), { requestId: "req-1" }, () => {
      bindContext({ meta: { actorUserId: "user-1" } });
      expect(getRequestMeta()).toEqual({ requestId: "req-1", actorUserId: "user-1" });
    });
  });

  it("no tira fuera de todo contexto", () => {
    expect(() => bindContext({ logFields: { userId: "user-1" } })).not.toThrow();
  });
});
