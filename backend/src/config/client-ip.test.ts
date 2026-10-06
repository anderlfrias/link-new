import { afterEach, describe, expect, it } from "vitest";
import env from "./env";
import { getClientIp, parseTrustProxy } from "./client-ip";

describe("parseTrustProxy", () => {
  it("un número -> cantidad de proxies delante del proceso", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy(" 2 ")).toBe(2);
    expect(parseTrustProxy("0")).toBe(0);
  });

  it("true/false, sin importar mayúsculas -> booleano", () => {
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("FALSE")).toBe(false);
    expect(parseTrustProxy("true")).toBe(true);
  });

  it("vacío -> false (sin proxy)", () => {
    expect(parseTrustProxy("")).toBe(false);
  });

  it("lista de IPs/subredes -> se pasa tal cual a Express", () => {
    expect(parseTrustProxy("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8");
  });
});

describe("getClientIp", () => {
  const originalTrustCf = env.TRUST_CF_CONNECTING_IP;

  afterEach(() => {
    env.TRUST_CF_CONNECTING_IP = originalTrustCf;
  });

  it("sin TRUST_CF_CONNECTING_IP ignora CF-Connecting-IP (cualquier cliente puede mandarla) y usa ip", () => {
    env.TRUST_CF_CONNECTING_IP = false;

    expect(getClientIp({ headers: { "cf-connecting-ip": "198.51.100.99" }, ip: "10.0.0.1" })).toBe("10.0.0.1");
  });

  it("con TRUST_CF_CONNECTING_IP usa CF-Connecting-IP", () => {
    env.TRUST_CF_CONNECTING_IP = true;

    expect(getClientIp({ headers: { "cf-connecting-ip": " 198.51.100.99 " }, ip: "10.0.0.1" })).toBe("198.51.100.99");
  });

  it("con TRUST_CF_CONNECTING_IP pero sin la cabecera, usa ip", () => {
    env.TRUST_CF_CONNECTING_IP = true;

    expect(getClientIp({ headers: {}, ip: "10.0.0.1" })).toBe("10.0.0.1");
    expect(getClientIp({ headers: { "cf-connecting-ip": "" }, ip: "10.0.0.1" })).toBe("10.0.0.1");
  });

  it("el default es no confiar en CF-Connecting-IP", () => {
    expect(originalTrustCf).toBe(false);
  });
});
