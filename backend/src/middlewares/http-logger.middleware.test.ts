import type { IncomingMessage, ServerResponse } from "node:http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import env from "../config/env";
import { customLogLevel, serializeRequest, shouldIgnoreRequest } from "./http-logger.middleware";

// Mismo patrón que app.test.ts: app.ts importa módulos que hacen llamadas
// externas al construirse (web-push, file.repository) — hay que mockearlos
// para poder levantar el `app` exportado bajo supertest.
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class WebPushError extends Error {},
}));

vi.mock("../modules/files/file.repository", () => ({
  findActiveById: vi.fn().mockResolvedValue(null),
}));

import app from "../app";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("httpLogger montado en app", () => {
  it("una respuesta 200 trae un header x-request-id con formato UUID", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-request-id"]).toMatch(UUID_RE);
  });

  it("dos requests distintas traen x-request-id distintos", async () => {
    const res1 = await request(app).get("/");
    const res2 = await request(app).get("/");
    expect(res1.headers["x-request-id"]).not.toBe(res2.headers["x-request-id"]);
  });
});

describe("customLogLevel", () => {
  function fakeRes(statusCode: number): ServerResponse {
    return { statusCode } as ServerResponse;
  }
  const fakeReq = {} as IncomingMessage;

  it('devuelve "error" para un status 500', () => {
    expect(customLogLevel(fakeReq, fakeRes(500))).toBe("error");
  });

  it('devuelve "error" si viene un err, sin importar el status', () => {
    expect(customLogLevel(fakeReq, fakeRes(200), new Error("boom"))).toBe("error");
  });

  it('devuelve "warn" para un status 404', () => {
    expect(customLogLevel(fakeReq, fakeRes(404))).toBe("warn");
  });

  it('devuelve "info" para un status 200', () => {
    expect(customLogLevel(fakeReq, fakeRes(200))).toBe("info");
  });
});

describe("serializeRequest", () => {
  it("no incluye el query string en la url serializada", () => {
    const serialized = serializeRequest({
      id: "req-1",
      method: "GET",
      url: "/v1/files/abc/content?t=secreto",
      headers: {},
      raw: {} as IncomingMessage,
    });

    expect(serialized.url).toBe("/v1/files/abc/content");
    expect(JSON.stringify(serialized)).not.toContain("secreto");
  });

  it("con TRUST_CF_CONNECTING_IP, toma la IP de cf-connecting-ip (misma regla que el rate limiting)", () => {
    const originalTrustCf = env.TRUST_CF_CONNECTING_IP;
    env.TRUST_CF_CONNECTING_IP = true;
    try {
      const serialized = serializeRequest({
        id: "req-1",
        method: "GET",
        url: "/v1/conversations",
        headers: {},
        raw: { ip: "10.0.0.1", headers: { "cf-connecting-ip": "198.51.100.99" } } as unknown as IncomingMessage,
      });

      expect(serialized.ip).toBe("198.51.100.99");
    } finally {
      env.TRUST_CF_CONNECTING_IP = originalTrustCf;
    }
  });

  it("toma la IP de req.raw (el visitante real, gracias a trust proxy)", () => {
    const serialized = serializeRequest({
      id: "req-1",
      method: "GET",
      url: "/v1/conversations",
      headers: {},
      raw: { ip: "203.0.113.5" } as unknown as IncomingMessage,
    });

    expect(serialized.ip).toBe("203.0.113.5");
  });

  it("incluye el user-agent", () => {
    const serialized = serializeRequest({
      id: "req-1",
      method: "GET",
      url: "/v1/conversations",
      headers: { "user-agent": "vitest" },
      raw: {} as IncomingMessage,
    });

    expect(serialized.userAgent).toBe("vitest");
  });
});

describe("shouldIgnoreRequest", () => {
  it('devuelve true para "/"', () => {
    expect(shouldIgnoreRequest({ url: "/" } as IncomingMessage)).toBe(true);
  });

  it('devuelve false para "/api/v1/conversations"', () => {
    expect(shouldIgnoreRequest({ url: "/api/v1/conversations" } as IncomingMessage)).toBe(false);
  });

  it("ignora GET /health, el healthcheck del contenedor (con o sin query)", () => {
    expect(shouldIgnoreRequest({ url: "/health" } as IncomingMessage)).toBe(true);
    expect(shouldIgnoreRequest({ url: "/health?probe=1" } as IncomingMessage)).toBe(true);
  });

  it("no ignora rutas que solo se parecen a /health", () => {
    expect(shouldIgnoreRequest({ url: "/healthz" } as IncomingMessage)).toBe(false);
    expect(shouldIgnoreRequest({ url: "/api/health" } as IncomingMessage)).toBe(false);
    expect(shouldIgnoreRequest({ url: "/health/extra" } as IncomingMessage)).toBe(false);
  });
});
