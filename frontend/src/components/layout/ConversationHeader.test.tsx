import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationHeader } from "./ConversationHeader";

describe("ConversationHeader", () => {
  it("renders back link, title, and subtitle", () => {
    render(
      <ConversationHeader
        title="Equipo de Finanzas"
        subtitle="3 miembros, 1 en línea"
      />,
    );

    const backLink = screen.getByRole("link", {
      name: "Volver a la lista de conversaciones",
    });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");

    expect(screen.getByText("Equipo de Finanzas")).toBeInTheDocument();
    expect(screen.getByText("3 miembros, 1 en línea")).toBeInTheDocument();
  });

  it("calls onOpenDetails when header button is clicked", async () => {
    const handleOpenDetails = vi.fn();
    const user = userEvent.setup();

    render(
      <ConversationHeader
        title="Dr. Juan Pérez"
        onOpenDetails={handleOpenDetails}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Ver información de Dr. Juan Pérez",
    });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(handleOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("disables details button when onOpenDetails is undefined", () => {
    render(<ConversationHeader title="Solo lectura" />);

    const button = screen.getByRole("button", {
      name: "Ver información de Solo lectura",
    });
    expect(button).toBeDisabled();
  });

  it("renders search button when onToggleSearch is provided and calls callback on click", async () => {
    const handleToggleSearch = vi.fn();
    const user = userEvent.setup();

    render(
      <ConversationHeader
        title="Chat de Pruebas"
        onToggleSearch={handleToggleSearch}
        isSearchOpen={false}
      />,
    );

    const searchButton = screen.getByRole("button", { name: "Buscar en el chat" });
    expect(searchButton).toBeInTheDocument();

    await user.click(searchButton);
    expect(handleToggleSearch).toHaveBeenCalledTimes(1);
  });
});
