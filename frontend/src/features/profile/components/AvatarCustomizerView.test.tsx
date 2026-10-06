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

  it("acredita título, autor y licencia de un estilo CC BY 4.0, con enlaces a la fuente y a la licencia", () => {
    const micah = AVATAR_STYLES.find((def) => def.style.meta?.creator === "Micah Lanier")!;
    render(<AvatarCustomizerView styleDef={micah} initialSeed="s" onBack={onBack} onConfirm={onConfirm} />);

    expect(screen.getByText(/de Micah Lanier, bajo licencia/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avatar Illustration System" })).toHaveAttribute(
      "href",
      "https://www.figma.com/community/file/829741575478342595",
    );
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("no muestra atribución para un estilo CC0", () => {
    const lorelei = AVATAR_STYLES.find((def) => def.style.meta?.title === "Lorelei")!;
    render(<AvatarCustomizerView styleDef={lorelei} initialSeed="s" onBack={onBack} onConfirm={onConfirm} />);

    expect(screen.queryByText(/bajo licencia/)).not.toBeInTheDocument();
  });
});
