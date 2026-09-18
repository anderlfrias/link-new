import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionExpiredModal } from "./SessionExpiredModal";

describe("SessionExpiredModal", () => {
  it("does not render when isOpen is false", () => {
    const onClose = vi.fn();
    render(<SessionExpiredModal isOpen={false} onClose={onClose} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders modal with title, message, and button when isOpen is true", () => {
    const onClose = vi.fn();
    render(<SessionExpiredModal isOpen={true} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Sesión expirada" })).toBeInTheDocument();
    expect(screen.getByText("Sesión expirada")).toBeInTheDocument();
    expect(
      screen.getByText("Tu sesión ha expirado. Por favor, iniciá sesión nuevamente para continuar."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("calls onClose when the action button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SessionExpiredModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SessionExpiredModal isOpen={true} onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
