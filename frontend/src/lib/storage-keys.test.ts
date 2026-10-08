import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateLegacyKey } from "./storage-keys";

describe("migrateLegacyKey", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("copia el valor de la clave vieja a la nueva y borra la vieja", () => {
    window.localStorage.setItem("chat-interno:theme", "dark");

    migrateLegacyKey("chat-interno:theme", "link:theme");

    expect(window.localStorage.getItem("link:theme")).toBe("dark");
    expect(window.localStorage.getItem("chat-interno:theme")).toBeNull();
  });

  it("no pisa una clave nueva que ya tiene valor, y igual borra la vieja", () => {
    window.localStorage.setItem("chat-interno:theme", "dark");
    window.localStorage.setItem("link:theme", "light");

    migrateLegacyKey("chat-interno:theme", "link:theme");

    expect(window.localStorage.getItem("link:theme")).toBe("light");
    expect(window.localStorage.getItem("chat-interno:theme")).toBeNull();
  });

  it("no hace nada si no hay clave vieja", () => {
    window.localStorage.setItem("link:theme", "dark");

    migrateLegacyKey("chat-interno:theme", "link:theme");

    expect(window.localStorage.getItem("link:theme")).toBe("dark");
    expect(window.localStorage.length).toBe(1);
  });

  it("conserva un valor que no es texto simple (una sesión serializada)", () => {
    const session = JSON.stringify({ token: "t", user: { name: "Ana", exp: 1900000000 } });
    window.localStorage.setItem("chat-interno:session", session);

    migrateLegacyKey("chat-interno:session", "link:session");

    expect(window.localStorage.getItem("link:session")).toBe(session);
  });

  it("no lanza si localStorage lanza", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: el acceso al almacenamiento está bloqueado");
    });

    expect(() => migrateLegacyKey("chat-interno:theme", "link:theme")).not.toThrow();
  });
});
