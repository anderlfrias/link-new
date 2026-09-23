import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QUICK_EMOJIS, QuickReactionPicker } from "./QuickReactionPicker";

describe("QuickReactionPicker", () => {
  it("renderiza todos los emojis rápidos", () => {
    render(<QuickReactionPicker onSelectEmoji={vi.fn()} />);

    for (const emoji of QUICK_EMOJIS) {
      expect(screen.getByLabelText(`Reaccionar con ${emoji}`)).toBeInTheDocument();
    }
  });

  it("llama a onSelectEmoji y onClose al hacer clic en un emoji", () => {
    const onSelectEmoji = vi.fn();
    const onClose = vi.fn();

    render(<QuickReactionPicker onSelectEmoji={onSelectEmoji} onClose={onClose} />);

    const heartBtn = screen.getByLabelText("Reaccionar con ❤️");
    fireEvent.click(heartBtn);

    expect(onSelectEmoji).toHaveBeenCalledWith("❤️");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("llama a onClose al hacer clic fuera del componente", () => {
    const onClose = vi.fn();

    render(
      <div>
        <div data-testid="outside">Outside</div>
        <QuickReactionPicker onSelectEmoji={vi.fn()} onClose={onClose} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no lanza error al hacer clic fuera si onClose no está definido", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <QuickReactionPicker onSelectEmoji={vi.fn()} />
      </div>,
    );

    expect(() => {
      fireEvent.mouseDown(screen.getByTestId("outside"));
    }).not.toThrow();
  });
});
