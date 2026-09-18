import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InChatSearchBar } from "./InChatSearchBar";

describe("InChatSearchBar", () => {
  const defaultProps = {
    searchQuery: "",
    onSearchChange: vi.fn(),
    matchCount: 0,
    activeMatchIndex: 0,
    onPrevMatch: vi.fn(),
    onNextMatch: vi.fn(),
    onClose: vi.fn(),
    isLoading: false,
  };

  it("renderiza el input con placeholder y enfoca automáticamente", () => {
    render(<InChatSearchBar {...defaultProps} />);

    const input = screen.getByPlaceholderText("Buscar en la conversación...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("llama a onSearchChange cuando el usuario escribe", async () => {
    const handleSearchChange = vi.fn();
    const user = userEvent.setup();

    render(<InChatSearchBar {...defaultProps} onSearchChange={handleSearchChange} />);

    const input = screen.getByPlaceholderText("Buscar en la conversación...");
    await user.type(input, "hola");

    expect(handleSearchChange).toHaveBeenCalled();
  });

  it("muestra el conteo de coincidencias cuando hay resultados", () => {
    render(
      <InChatSearchBar
        {...defaultProps}
        searchQuery="reporte"
        matchCount={5}
        activeMatchIndex={2}
      />,
    );

    expect(screen.getByText("2 de 5")).toBeInTheDocument();
  });

  it("muestra 'Sin resultados' cuando hay query pero 0 coincidencias", () => {
    render(
      <InChatSearchBar
        {...defaultProps}
        searchQuery="inexistente"
        matchCount={0}
        activeMatchIndex={0}
      />,
    );

    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("llama a onNextMatch al presionar Enter o hacer clic en siguiente", async () => {
    const handleNext = vi.fn();
    const user = userEvent.setup();

    render(
      <InChatSearchBar
        {...defaultProps}
        searchQuery="test"
        matchCount={3}
        activeMatchIndex={1}
        onNextMatch={handleNext}
      />,
    );

    const input = screen.getByPlaceholderText("Buscar en la conversación...");
    await user.type(input, "{Enter}");
    expect(handleNext).toHaveBeenCalledTimes(1);

    const nextBtn = screen.getByRole("button", { name: "Siguiente coincidencia" });
    await user.click(nextBtn);
    expect(handleNext).toHaveBeenCalledTimes(2);
  });

  it("llama a onPrevMatch al presionar Shift+Enter o hacer clic en anterior", async () => {
    const handlePrev = vi.fn();
    const user = userEvent.setup();

    render(
      <InChatSearchBar
        {...defaultProps}
        searchQuery="test"
        matchCount={3}
        activeMatchIndex={2}
        onPrevMatch={handlePrev}
      />,
    );

    const input = screen.getByPlaceholderText("Buscar en la conversación...");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(handlePrev).toHaveBeenCalledTimes(1);

    const prevBtn = screen.getByRole("button", { name: "Coincidencia anterior" });
    await user.click(prevBtn);
    expect(handlePrev).toHaveBeenCalledTimes(2);
  });

  it("llama a onClose al presionar Escape o hacer clic en cerrar", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(<InChatSearchBar {...defaultProps} onClose={handleClose} />);

    const input = screen.getByPlaceholderText("Buscar en la conversación...");
    await user.type(input, "{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole("button", { name: "Cerrar búsqueda" });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("permite limpiar el texto de búsqueda con el botón de limpiar", async () => {
    const handleSearchChange = vi.fn();
    const user = userEvent.setup();

    render(
      <InChatSearchBar
        {...defaultProps}
        searchQuery="texto previo"
        onSearchChange={handleSearchChange}
      />,
    );

    const clearBtn = screen.getByRole("button", { name: "Limpiar búsqueda" });
    await user.click(clearBtn);

    expect(handleSearchChange).toHaveBeenCalledWith("");
  });
});
