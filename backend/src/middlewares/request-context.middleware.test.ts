import { afterEach, describe, expect, it } from "vitest";
import env from "../config/env";
import { getLogger, getRequestMeta } from "../config/request-context";
import { logger as rootLogger } from "../config/logger";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { requestContext } from "./request-context.middleware";

describe("requestContext", () => {
  const originalTrustCf = env.TRUST_CF_CONNECTING_IP;

  afterEach(() => {
    env.TRUST_CF_CONNECTING_IP = originalTrustCf;
  });

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

  it("con TRUST_CF_CONNECTING_IP, prioriza cf-connecting-ip sobre req.ip para getRequestMeta()", () => {
    env.TRUST_CF_CONNECTING_IP = true;
    const req = createMockRequest({
      id: "req-2",
      ip: "10.0.0.1",
      headers: {
        "cf-connecting-ip": "198.51.100.99",
        "user-agent": "vitest",
      },
    });
    let capturedMeta: unknown;
    const next = () => {
      capturedMeta = getRequestMeta();
    };

    requestContext(req, createMockResponse(), next);

    expect(capturedMeta).toEqual({
      requestId: "req-2",
      ip: "198.51.100.99",
      userAgent: "vitest",
    });
  });
  it("sin TRUST_CF_CONNECTING_IP, ignora cf-connecting-ip (cualquier cliente puede mandarla) y usa req.ip", () => {
    env.TRUST_CF_CONNECTING_IP = false;
    const req = createMockRequest({
      id: "req-3",
      ip: "10.0.0.1",
      headers: { "cf-connecting-ip": "198.51.100.99" },
    });
    let capturedIp: unknown;
    const next = () => {
      capturedIp = getRequestMeta().ip;
    };

    requestContext(req, createMockResponse(), next);

    expect(capturedIp).toBe("10.0.0.1");
  });
});
