import { describe, expect, it } from "vitest";
import { getLogger, getRequestMeta } from "../config/request-context";
import { logger as rootLogger } from "../config/logger";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { requestContext } from "./request-context.middleware";

describe("requestContext", () => {
  it("llama a next() exactamente una vez", () => {
    const req = createMockRequest({ id: "req-1", ip: "203.0.113.5" });
    const next = createMockNext();

    requestContext(req, createMockResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("dentro de next(), getLogger() devuelve un logger distinto del raíz", () => {
    const req = createMockRequest({ id: "req-1", ip: "203.0.113.5" });
    let capturedLogger: unknown;
    const next = () => {
      capturedLogger = getLogger();
    };

    requestContext(req, createMockResponse(), next);

    expect(capturedLogger).not.toBe(rootLogger);
  });

  it("dentro de next(), getRequestMeta() trae ip, userAgent y requestId de la request", () => {
    const req = createMockRequest({
      id: "req-1",
      ip: "203.0.113.5",
      headers: { "user-agent": "vitest" },
    });
    let capturedMeta: unknown;
    const next = () => {
      capturedMeta = getRequestMeta();
    };

    requestContext(req, createMockResponse(), next);

    expect(capturedMeta).toEqual({
      requestId: "req-1",
      ip: "203.0.113.5",
      userAgent: "vitest",
    });
  });
});
