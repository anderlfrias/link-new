import type { IncomingHttpHeaders } from "http";
import env from "./env";

/// Convierte TRUST_PROXY al valor de `trust proxy` de Express (ver app.ts):
/// - "false" → no hay proxy delante: la IP es la de la conexión TCP.
/// - un número ("1", "2") → cantidad de proxies delante de este proceso.
/// - "true" → confía en cualquier proxy. No conviene: el cliente puede elegir
///   su IP con X-Forwarded-For.
/// - cualquier otro texto → lista de IPs/subredes de proxies de confianza, tal
///   cual la acepta Express (ej. "loopback, 10.0.0.0/8").
export function parseTrustProxy(raw: string): boolean | number | string {
  const value = raw.trim();
  if (value === "" || value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/// IP del cliente para rate limiting, logs y audit trail. `CF-Connecting-IP`
/// solo cuenta con TRUST_CF_CONNECTING_IP=true: sin Cloudflare delante,
/// cualquier cliente puede mandar esa cabecera, elegir su IP y con eso
/// saltarse el rate limiting. Si no, `ip`: en Express es `req.ip`, que ya
/// aplica TRUST_PROXY.
export function getClientIp(req: { headers: IncomingHttpHeaders; ip?: string }): string | undefined {
  if (env.TRUST_CF_CONNECTING_IP) {
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && cfIp.trim() !== "") return cfIp.trim();
  }
  return req.ip;
}
