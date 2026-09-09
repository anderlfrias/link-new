import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./vapid-key";

describe("urlBase64ToUint8Array", () => {
  it("convierte string base64 sin padding a Uint8Array", () => {
    // "hello" en base64 estándar es "aGVsbG8=" (con padding). Sin padding: "aGVsbG8"
    const input = "aGVsbG8";
    const result = urlBase64ToUint8Array(input);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe("hello");
  });

  it("convierte string base64 con padding completo a Uint8Array", () => {
    // "any car" en base64 es "YW55IGNhcg==" (longitud % 4 == 2, requiere ==)
    // URL-safe base64 sin padding: "YW55IGNhcg"
    const input = "YW55IGNhcg==";
    const result = urlBase64ToUint8Array(input);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe("any car");
  });

  it("reemplaza caracteres url-safe '-' y '_' por '+' y '/'", () => {
    // Caracteres binarios que produzcan '-' y '_' en base64 url-safe
    // Por ejemplo bytes [251, 239] -> base64 "/+8=" o url-safe "_-8="
    const urlSafe = "_-8";
    const result = urlBase64ToUint8Array(urlSafe);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});
