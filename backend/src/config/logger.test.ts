import { describe, expect, it } from "vitest";
import { buildLogger } from "./logger";

function captureLogger(opts?: { level?: string }) {
  const lines: Record<string, unknown>[] = [];
  const logger = buildLogger({
    level: opts?.level ?? "info",
    destination: { write: (chunk: string) => lines.push(JSON.parse(chunk)) },
  });
  return { logger, lines };
}

describe("buildLogger", () => {
  it("loguea JSON parseable, con level y time", () => {
    const { logger, lines } = captureLogger();
    logger.info("hola");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("level");
    expect(lines[0]).toHaveProperty("time");
    expect(lines[0].msg).toBe("hola");
  });

  it("time es ISO-8601, no un epoch numérico", () => {
    const { logger, lines } = captureLogger();
    logger.info("hola");
    const time = lines[0].time;
    expect(typeof time).toBe("string");
    // Formato ISO-8601 completo (con milisegundos y zona), no un número de epoch.
    expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("redacta req.headers.authorization", () => {
    const { logger, lines } = captureLogger();
    const secretToken = "Bearer eyJSECRETTOKENVALUE";
    logger.info({ req: { headers: { authorization: secretToken } } }, "request");

    const serialized = JSON.stringify(lines[0]);
    expect(serialized).not.toContain(secretToken);
    expect((lines[0].req as { headers: { authorization: string } }).headers.authorization).toBe(
      "[Redacted]",
    );
  });

  it("redacta password en cualquier nivel", () => {
    const { logger, lines } = captureLogger();
    logger.info({ password: "hunter2", body: { password: "hunter2-nested" } }, "login attempt");

    const serialized = JSON.stringify(lines[0]);
    expect(serialized).not.toContain("hunter2");
    expect(lines[0].password).toBe("[Redacted]");
    expect((lines[0].body as { password: string }).password).toBe("[Redacted]");
  });

  it("redacta el body crudo que body-parser adjunta a sus errores (err.body)", () => {
    const { logger, lines } = captureLogger();
    const err = Object.assign(new Error("Unexpected end of JSON input"), { body: '{"password":"secreto-123"' });

    logger.error({ err }, "unhandled error");

    expect(JSON.stringify(lines[0])).not.toContain("secreto-123");
    expect((lines[0].err as { body: string }).body).toBe("[Redacted]");
  });

  it("respeta el nivel configurado", () => {
    const { logger, lines } = captureLogger({ level: "warn" });
    logger.info("esto no debería salir");
    expect(lines).toHaveLength(0);

    logger.warn("esto sí");
    expect(lines).toHaveLength(1);
  });

  it("un child logger propaga el campo a cada línea", () => {
    const { logger, lines } = captureLogger();
    const child = logger.child({ requestId: "abc-123" });
    child.info("primera");
    child.info("segunda");

    expect(lines).toHaveLength(2);
    expect(lines[0].requestId).toBe("abc-123");
    expect(lines[1].requestId).toBe("abc-123");
  });
});
