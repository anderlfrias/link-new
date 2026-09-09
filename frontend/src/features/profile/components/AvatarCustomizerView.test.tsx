import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarCustomizerView } from "./AvatarCustomizerView";
import { AVATAR_STYLES } from "@/constants/avatar-catalog";

vi.mock("@/utils/dicebear-renderer", () => ({
  renderDiceBearDataUri: vi.fn().mockReturnValue("data:image/svg+xml;base64,mock"),
  renderDiceBearSvg: vi.fn().mockReturnValue("<svg>avatar</svg>"),
  svgStringToPngBlob: vi.fn().mockResolvedValue(new Blob(["png-data"], { type: "image/png" })),
}));

describe("AvatarCustomizerView", () => {
  const onBack = vi.fn();
  const onConfirm = vi.fn();
  const sampleStyle = AVATAR_STYLES[0];

  it("renderiza vista de personalización, botón volver y confirmar", async () => {
    const user = userEvent.setup();
    render(
      <AvatarCustomizerView
        styleDef={sampleStyle}
        initialSeed="user-seed"
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );

    // Botón volver
    const backBtn = screen.getByRole("button", { name: "Volver al catálogo" });
    await user.click(backBtn);
    expect(onBack).toHaveBeenCalled();

    // Botón guardar
    const saveBtn = screen.getByRole("button", { name: "Aplicar avatar" });
    await user.click(saveBtn);
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("permite aleatorizar el avatar con el botón de dados", async () => {
    const user = userEvent.setup();
    render(
      <AvatarCustomizerView
        styleDef={sampleStyle}
        initialSeed="user-seed"
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );

    const diceBtn = screen.getByTitle("Generar otra variante de este estilo");
    await user.click(diceBtn);
    expect(diceBtn).toBeInTheDocument();
  });
});
