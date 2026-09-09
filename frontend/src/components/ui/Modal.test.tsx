import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders dialog with aria attributes and children", () => {
    const handleClose = vi.fn();
    render(
      <Modal onClose={handleClose} aria-label="Nuevo grupo">
        <div>Contenido del modal</div>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Nuevo grupo" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Contenido del modal")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <Modal onClose={handleClose} aria-label="Test Modal">
        <button>Inside Content</button>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    await user.click(dialog);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the modal card", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <Modal onClose={handleClose} aria-label="Test Modal">
        <button>Inside Content</button>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Inside Content" }));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("calls onClose when pressing Escape", () => {
    const handleClose = vi.fn();

    render(
      <Modal onClose={handleClose} aria-label="Test Modal">
        <div>Contenido</div>
      </Modal>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
