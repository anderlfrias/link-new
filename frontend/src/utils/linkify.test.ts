import { describe, it, expect } from "vitest";
import {
  tokenizeMessageContent,
  isValidPhoneNumber,
  buildTelHref,
  buildUrlHref,
} from "./linkify";

describe("linkify utils", () => {
  describe("isValidPhoneNumber", () => {
    it("valida números telefónicos válidos de República Dominicana e internacionales", () => {
      expect(isValidPhoneNumber("(809) 588-4444")).toBe(true);
      expect(isValidPhoneNumber("809-588-4444")).toBe(true);
      expect(isValidPhoneNumber("829.123.4567")).toBe(true);
      expect(isValidPhoneNumber("849 555 1234")).toBe(true);
      expect(isValidPhoneNumber("8095884444")).toBe(true);
      expect(isValidPhoneNumber("+1 (809) 555-1234")).toBe(true);
      expect(isValidPhoneNumber("+34 612 34 56 78")).toBe(true);
      expect(isValidPhoneNumber("555-1234")).toBe(true);
    });

    it("descarta fechas, horas y números cortos que no son teléfonos", () => {
      expect(isValidPhoneNumber("2026-09-09")).toBe(false);
      expect(isValidPhoneNumber("2026/09/09")).toBe(false);
      expect(isValidPhoneNumber("15/09/2026")).toBe(false);
      expect(isValidPhoneNumber("14:30")).toBe(false);
      expect(isValidPhoneNumber("10:45:00")).toBe(false);
      expect(isValidPhoneNumber("2026")).toBe(false);
      expect(isValidPhoneNumber("12345")).toBe(false);
      expect(isValidPhoneNumber("987654")).toBe(false);
      // Número simple sin separadores ni '+' con menos de 10 dígitos (ej. código interno)
      expect(isValidPhoneNumber("1234567")).toBe(false);
    });
  });

  describe("buildTelHref & buildUrlHref", () => {
    it("formatea el href para teléfonos correctamente", () => {
      expect(buildTelHref("(809) 588-4444")).toBe("tel:8095884444");
      expect(buildTelHref("+1 (809) 555-1234")).toBe("tel:+18095551234");
      expect(buildTelHref("+34 612 345 678")).toBe("tel:+34612345678");
      expect(buildTelHref("809-555-1234")).toBe("tel:8095551234");
    });

    it("formatea el href para URLs asegurando el protocolo", () => {
      expect(buildUrlHref("https://example.org")).toBe("https://example.org");
      expect(buildUrlHref("http://ejemplo.com")).toBe("http://ejemplo.com");
      expect(buildUrlHref("www.google.com")).toBe("https://www.google.com");
      expect(buildUrlHref("example.org/portal")).toBe("https://example.org/portal");
    });
  });

  describe("tokenizeMessageContent", () => {
    it("devuelve array vacío si el contenido es nulo o vacío", () => {
      expect(tokenizeMessageContent("")).toEqual([]);
    });

    it("retorna un único token de texto si no contiene enlaces, emails ni teléfonos", () => {
      const text = "Hola doctor, ¿cómo está?";
      const tokens = tokenizeMessageContent(text);
      expect(tokens).toEqual([{ type: "text", value: "Hola doctor, ¿cómo está?" }]);
    });

    it("detecta URLs completas con protocolo y mantiene parámetros", () => {
      const text = "Ver informe en https://example.org/paciente?id=123&ficha=456#lab";
      const tokens = tokenizeMessageContent(text);
      expect(tokens).toEqual([
        { type: "text", value: "Ver informe en " },
        {
          type: "url",
          value: "https://example.org/paciente?id=123&ficha=456#lab",
          href: "https://example.org/paciente?id=123&ficha=456#lab",
        },
      ]);
    });

    it("detecta URLs con www y dominios conocidos sin protocolo", () => {
      const text = "Entra a www.example.org o revisa github.com/anderlfrias";
      const tokens = tokenizeMessageContent(text);
      expect(tokens).toHaveLength(4);
      expect(tokens[1]).toEqual({
        type: "url",
        value: "www.example.org",
        href: "https://www.example.org",
      });
      expect(tokens[3]).toEqual({
        type: "url",
        value: "github.com/anderlfrias",
        href: "https://github.com/anderlfrias",
      });
    });

    it("limpia signos de puntuación al final de las URLs", () => {
      const text = "¿Ya visitaste https://google.com? (ver https://example.org).";
      const tokens = tokenizeMessageContent(text);
      expect(tokens[1]).toEqual({
        type: "url",
        value: "https://google.com",
        href: "https://google.com",
      });
      expect(tokens[2].value).toBe("? (ver ");
      expect(tokens[3]).toEqual({
        type: "url",
        value: "https://example.org",
        href: "https://example.org",
      });
      expect(tokens[4].value).toBe(").");
    });

    it("detecta correos electrónicos y limpia puntuación de cierre", () => {
      const text = "Escribe a contacto@example.org o a dr.perez@example.co.uk.";
      const tokens = tokenizeMessageContent(text);
      expect(tokens).toHaveLength(5);
      expect(tokens[1]).toEqual({
        type: "email",
        value: "contacto@example.org",
        href: "mailto:contacto@example.org",
      });
      expect(tokens[3]).toEqual({
        type: "email",
        value: "dr.perez@example.co.uk",
        href: "mailto:dr.perez@example.co.uk",
      });
      expect(tokens[4]).toEqual({
        type: "text",
        value: ".",
      });
    });

    it("detecta números de teléfono en múltiples formatos y limpia puntuación", () => {
      const text = "Llama al (809) 588-4444 o al móvil +1 829 555 1234.";
      const tokens = tokenizeMessageContent(text);
      expect(tokens).toHaveLength(5);
      expect(tokens[1]).toEqual({
        type: "phone",
        value: "(809) 588-4444",
        href: "tel:8095884444",
      });
      expect(tokens[2].value).toBe(" o al móvil ");
      expect(tokens[3]).toEqual({
        type: "phone",
        value: "+1 829 555 1234",
        href: "tel:+18295551234",
      });
      expect(tokens[4].value).toBe(".");
    });

    it("combina URLs, correos y teléfonos en un mismo mensaje respetando el orden exacto", () => {
      const text =
        "Hola, visita https://example.org/portal, llama al (809) 588-4444 o envía correo a soporte@example.org para asistencia.";
      const tokens = tokenizeMessageContent(text);

      expect(tokens).toHaveLength(7);
      expect(tokens[0]).toEqual({ type: "text", value: "Hola, visita " });
      expect(tokens[1]).toEqual({
        type: "url",
        value: "https://example.org/portal",
        href: "https://example.org/portal",
      });
      expect(tokens[2]).toEqual({ type: "text", value: ", llama al " });
      expect(tokens[3]).toEqual({
        type: "phone",
        value: "(809) 588-4444",
        href: "tel:8095884444",
      });
      expect(tokens[4]).toEqual({ type: "text", value: " o envía correo a " });
      expect(tokens[5]).toEqual({
        type: "email",
        value: "soporte@example.org",
        href: "mailto:soporte@example.org",
      });
      expect(tokens[6]).toEqual({ type: "text", value: " para asistencia." });
    });

    it("no confunde fechas con números de teléfono", () => {
      const text = "La cita es el 2026-09-15 a las 10:30.";
      const tokens = tokenizeMessageContent(text);
      expect(tokens).toEqual([{ type: "text", value: "La cita es el 2026-09-15 a las 10:30." }]);
    });

    it("detecta menciones (@usuario) y no las confunde con correos electrónicos", () => {
      const text = "Hola @carlos, envía el informe a carlos@example.org o avisa a @maria.perez.";
      const tokens = tokenizeMessageContent(text);

      expect(tokens).toEqual([
        { type: "text", value: "Hola " },
        { type: "mention", value: "@carlos" },
        { type: "text", value: ", envía el informe a " },
        { type: "email", value: "carlos@example.org", href: "mailto:carlos@example.org" },
        { type: "text", value: " o avisa a " },
        { type: "mention", value: "@maria.perez" },
        { type: "text", value: "." },
      ]);
    });

    it("detecta mención al principio del texto y entre paréntesis", () => {
      const text = "@doctor (@juan) revisa el caso";
      const tokens = tokenizeMessageContent(text);

      expect(tokens).toEqual([
        { type: "mention", value: "@doctor" },
        { type: "text", value: " (" },
        { type: "mention", value: "@juan" },
        { type: "text", value: ") revisa el caso" },
      ]);
    });
  });
});
