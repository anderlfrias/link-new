import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarSelectionModal } from "./AvatarSelectionModal";

vi.mock("@/utils/dicebear-renderer", () => ({
  renderDiceBearDataUri: vi.fn().mockReturnValue("data:image/svg+xml;base64,mock"),
}));

describe("AvatarSelectionModal", () => {
  const onClose = vi.fn();
  const onSelectImage = vi.fn();

  it("no renderiza nada si isOpen es false", () => {
    const { container } = render(
      <AvatarSelectionModal
        isOpen={false}
        onClose={onClose}
        userSeed="seed-1"
        onSelectImage={onSelectImage}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renderiza modal cuando isOpen es true y permite alternar pestañas", async () => {
    const user = userEvent.setup();
    render(
      <AvatarSelectionModal
        isOpen={true}
        onClose={onClose}
        userSeed="seed-1"
        onSelectImage={onSelectImage}
      />,
    );

    expect(screen.getByRole("heading", { name: "Foto de perfil" })).toBeInTheDocument();

    // Pestañas
    const abstractTab = screen.getByRole("button", { name: /Abstractos/i });
    await user.click(abstractTab);
    expect(screen.getByText("Beam")).toBeInTheDocument();

    const uploadTab = screen.getByRole("button", { name: /Subir archivo/i });
    await user.click(uploadTab);
    expect(screen.getByText(/Arrastrá tu foto acá/i)).toBeInTheDocument();

    // Botón cerrar
    const closeBtn = screen.getByRole("button", { name: "Cerrar modal" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
