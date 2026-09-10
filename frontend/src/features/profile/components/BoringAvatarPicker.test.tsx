import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoringAvatarPicker } from "./BoringAvatarPicker";

vi.mock("@/utils/svg-to-png", () => ({
  svgElementToPngBlob: vi.fn().mockResolvedValue(new Blob(["fake-png"], { type: "image/png" })),
}));

describe("BoringAvatarPicker", () => {
  it("renderiza variantes y permite navegar a opciones y volver", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<BoringAvatarPicker seed="user-123" onSelect={onSelect} />);

    // Muestra variantes
    expect(screen.getByText("Beam")).toBeInTheDocument();
    expect(screen.getByText("Pixel")).toBeInTheDocument();

    // Click en "Beam"
    await user.click(screen.getByText("Beam"));

    // Debe mostrar botón volver (con el nombre de la variante seleccionada)
    const backBtn = screen.getByRole("button", { name: "Beam" });
    expect(backBtn).toBeInTheDocument();

    await user.click(backBtn);
    expect(screen.getByText("Pixel")).toBeInTheDocument();
  }, 15000);
});
