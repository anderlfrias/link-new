import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { I18nProvider, useTranslation } from "./i18n-context";
import { LOCALE_STORAGE_KEY } from "./types";
import { es } from "./locales/es";
import { en } from "./locales/en";

describe("i18n-context", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "es";
  });

  it("provides safe fallback when useTranslation is called outside of I18nProvider", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.locale).toBe("es");
    expect(result.current.t("common.accept")).toBe("Aceptar");
  });

  it("initializes with default locale 'es' when storage is empty", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.locale).toBe("es");
    expect(result.current.t("common.accept")).toBe("Aceptar");
    expect(document.documentElement.lang).toBe("es");
  });

  it("initializes with initialLocale if explicitly provided", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider initialLocale="en">{children}</I18nProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.locale).toBe("en");
    expect(result.current.t("common.accept")).toBe("Accept");
    expect(document.documentElement.lang).toBe("en");
  });

  it("initializes with stored locale from localStorage if present", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.locale).toBe("en");
    expect(result.current.t("common.accept")).toBe("Accept");
    expect(document.documentElement.lang).toBe("en");
  });

  it("translates text and interpolates parameters correctly", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.t("chat.membersCount", { count: 5 })).toBe("5 participantes");
    expect(result.current.t("chat.forwardedFrom", { name: "Carlos" })).toBe("Reenviado de Carlos");
  });

  it("switches locale in real time and persists to localStorage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.locale).toBe("es");
    expect(result.current.t("common.save")).toBe("Guardar");

    act(() => {
      result.current.setLocale("en");
    });

    expect(result.current.locale).toBe("en");
    expect(result.current.t("common.save")).toBe("Save");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("falls back to key string when translation key is unknown", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.t("non.existent.key")).toBe("non.existent.key");
  });

  it("preserves dictionary parity: every key in 'es' must exist in 'en' with non-empty string", () => {
    function checkKeys(esObj: Record<string, unknown>, enObj: Record<string, unknown>, path = "") {
      for (const key of Object.keys(esObj)) {
        const currentPath = path ? `${path}.${key}` : key;
        expect(enObj, `Missing domain or key in 'en': ${currentPath}`).toHaveProperty(key);

        const esVal = esObj[key];
        const enVal = enObj[key];

        if (typeof esVal === "object" && esVal !== null) {
          expect(typeof enVal, `Expected ${currentPath} to be object in 'en'`).toBe("object");
          checkKeys(
            esVal as Record<string, unknown>,
            enVal as Record<string, unknown>,
            currentPath,
          );
        } else {
          expect(typeof enVal, `Expected ${currentPath} to be string in 'en'`).toBe("string");
          expect(
            (enVal as string).trim().length,
            `String at ${currentPath} in 'en' should not be empty`,
          ).toBeGreaterThan(0);
        }
      }
    }

    checkKeys(es as unknown as Record<string, unknown>, en as unknown as Record<string, unknown>);
  });
});
