import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSelector } from "./LanguageSelector";
import { I18nProvider } from "@/i18n";
import React from "react";

function renderWithI18n(ui: React.ReactElement, initialLocale: "es" | "en" = "es") {
  return render(<I18nProvider initialLocale={initialLocale}>{ui}</I18nProvider>);
}

describe("LanguageSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders both supported languages in segmented mode", () => {
    renderWithI18n(<LanguageSelector variant="segmented" />);

    expect(screen.getByRole("radio", { name: /español/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /english/i })).toBeInTheDocument();
  });

  it("marks current locale as active", () => {
    renderWithI18n(<LanguageSelector variant="segmented" />, "es");

    const esRadio = screen.getByRole("radio", { name: /español/i });
    const enRadio = screen.getByRole("radio", { name: /english/i });

    expect(esRadio).toHaveAttribute("aria-checked", "true");
    expect(enRadio).toHaveAttribute("aria-checked", "false");
  });

  it("switches language when clicking English option", async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();

    renderWithI18n(
      <LanguageSelector variant="segmented" onLanguageChange={onLanguageChange} />,
      "es",
    );

    const enRadio = screen.getByRole("radio", { name: /english/i });
    await user.click(enRadio);

    expect(onLanguageChange).toHaveBeenCalledWith("en");
    expect(enRadio).toHaveAttribute("aria-checked", "true");
  });

  it("renders compact mode correctly", async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();

    renderWithI18n(
      <LanguageSelector variant="compact" onLanguageChange={onLanguageChange} />,
      "es",
    );

    const enButton = screen.getByRole("button", { name: /english/i });
    expect(enButton).toBeInTheDocument();

    await user.click(enButton);
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });

  it("does not trigger change when disabled", async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();

    renderWithI18n(
      <LanguageSelector variant="segmented" disabled onLanguageChange={onLanguageChange} />,
      "es",
    );

    const enRadio = screen.getByRole("radio", { name: /english/i });
    await user.click(enRadio);

    expect(onLanguageChange).not.toHaveBeenCalled();
  });
});
