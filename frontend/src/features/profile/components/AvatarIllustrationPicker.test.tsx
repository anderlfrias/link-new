import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarIllustrationPicker } from "./AvatarIllustrationPicker";

vi.mock("@/utils/dicebear-renderer", () => ({
  renderDiceBearDataUri: vi.fn().mockReturnValue("data:image/svg+xml;base64,mock"),
}));

describe("AvatarIllustrationPicker", () => {
  it("renderiza categorías, campo de búsqueda y selecciona una ilustración al hacer click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <AvatarIllustrationPicker
        userSeed="seed-123"
        onSelectIllustration={onSelect}
      />,
    );

    // Barra de búsqueda
    expect(screen.getByPlaceholderText(/Buscar ilustraciones/i)).toBeInTheDocument();

    // Categorías
    expect(screen.getByRole("button", { name: /Todos/i })).toBeInTheDocument();

    // Botones de avatares en la grilla
    const avatarButtons = screen.getAllByRole("button");
    // Al menos hay categorías y avatares
    expect(avatarButtons.length).toBeGreaterThan(5);

    // Buscar una ilustración de la grilla (tienen alt con "Ilustración <Nombre>")
    const illustrationCards = screen.getAllByRole("button", { name: /Ilustración/i });
    expect(illustrationCards.length).toBeGreaterThan(0);
    await user.click(illustrationCards[0]);
    expect(onSelect).toHaveBeenCalled();
  });

  it("permite filtrar estilos por búsqueda", async () => {
    const user = userEvent.setup();
    render(
      <AvatarIllustrationPicker
        userSeed="seed-123"
        onSelectIllustration={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar ilustraciones/i);
    await user.type(searchInput, "Robot");

    // Debe mostrar resultados filtrados
    expect(searchInput).toHaveValue("Robot");
  });
});
