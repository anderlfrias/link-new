import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "./Drawer";

describe("Drawer", () => {
  it("renders dialog with aria attributes and children", () => {
    const handleClose = vi.fn();
    render(
      <Drawer onClose={handleClose} aria-label="Detalles de conversación">
        <p>Drawer Content</p>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Detalles de conversación" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Drawer Content")).toBeInTheDocument();
  });

  it("calls onClose when clicking the backdrop", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <Drawer onClose={handleClose} aria-label="Test Drawer">
        <button>Inside Drawer</button>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog");
    await user.click(dialog);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the drawer content", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <Drawer onClose={handleClose} aria-label="Test Drawer">
        <button>Inside Drawer</button>
      </Drawer>,
    );

    await user.click(screen.getByRole("button", { name: "Inside Drawer" }));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();

    render(
      <Drawer onClose={handleClose} aria-label="Test Drawer">
        <div>Content</div>
      </Drawer>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
