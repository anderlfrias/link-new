import { describe, it, expect } from "vitest";
import { getActiveMentionQuery } from "./mention";

describe("getActiveMentionQuery", () => {
  it("retorna null si el texto está vacío", () => {
    expect(getActiveMentionQuery("", 0)).toBeNull();
  });

  it("detecta @ al inicio del texto", () => {
    const result = getActiveMentionQuery("@", 1);
    expect(result).toEqual({ query: "", startIndex: 0 });
  });

  it("detecta @ seguido de caracteres parciales al inicio del texto", () => {
    const result = getActiveMentionQuery("@carlos", 7);
    expect(result).toEqual({ query: "carlos", startIndex: 0 });
  });

  it("detecta @ precedido por espacio en medio del texto", () => {
    const text = "Hola @ana cómo estás";
    const result = getActiveMentionQuery(text, 9);
    expect(result).toEqual({ query: "ana", startIndex: 5 });
  });

  it("retorna null si hay un espacio después del @query y el cursor está después del espacio", () => {
    const text = "Hola @ana ";
    const result = getActiveMentionQuery(text, text.length);
    expect(result).toBeNull();
  });

  it("no detecta @ si es parte de una dirección de correo electrónico", () => {
    const text = "Escríbeme a soporte@example.com por favor";
    const atPosition = text.indexOf("@");
    // Cursor justo después del dominio o del arroba
    expect(getActiveMentionQuery(text, atPosition + 1)).toBeNull();
    expect(getActiveMentionQuery(text, text.indexOf(" "))).toBeNull();
  });

  it("soporta caracteres con tildes y caracteres especiales de nombre", () => {
    const text = "Aviso a @Martín";
    const result = getActiveMentionQuery(text, text.length);
    expect(result).toEqual({ query: "Martín", startIndex: 8 });
  });
});
