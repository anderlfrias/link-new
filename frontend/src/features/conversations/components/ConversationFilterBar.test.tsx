import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationFilterBar } from "./ConversationFilterBar";
import { I18nProvider } from "@/i18n";
import React from "react";

describe("ConversationFilterBar", () => {
  it("renders all filter options", () => {
    const onChange = vi.fn();
    render(<ConversationFilterBar active="all" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No leídos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grupos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favoritos" })).toBeInTheDocument();
  });

  it("renders all filter options in English when locale is en", () => {
    const onChange = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <ConversationFilterBar active="all" onChange={onChange} />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unread" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Groups" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toBeInTheDocument();
  });

  it("applies active styles to the selected filter", () => {
    const onChange = vi.fn();
    render(<ConversationFilterBar active="groups" onChange={onChange} />);

    const groupsButton = screen.getByRole("button", { name: "Grupos" });
    expect(groupsButton.className).toContain("bg-brand-blue");

    const allButton = screen.getByRole("button", { name: "Todos" });
    expect(allButton.className).not.toContain("bg-brand-blue");
  });

  it("calls onChange with the selected filter key when clicked", () => {
    const onChange = vi.fn();
    render(<ConversationFilterBar active="all" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Favoritos" }));
    expect(onChange).toHaveBeenCalledWith("favorites");

    fireEvent.click(screen.getByRole("button", { name: "No leídos" }));
    expect(onChange).toHaveBeenCalledWith("unread");
  });
});
