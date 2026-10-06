import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemporaryPasswordModal } from "./TemporaryPasswordModal";
import { copyTextToClipboard } from "@/utils/clipboard";

vi.mock("@/utils/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

function renderModal(onClose = vi.fn()) {
  render(<TemporaryPasswordModal accountLabel="ana@example.com" password="Temp-123-abc" onClose={onClose} />);
  return onClose;
}

describe("TemporaryPasswordModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the password, who it belongs to and the one-time warning", () => {
    renderModal();
    expect(screen.getByTestId("temporary-password")).toHaveTextContent("Temp-123-abc");
    expect(screen.getByText(/Contraseña temporal de ana@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/No se vuelve a mostrar/)).toBeInTheDocument();
  });

  it("copies the password and confirms it", async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(copyTextToClipboard).toHaveBeenCalledWith("Temp-123-abc");
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
  });

  it("does not claim it was copied when the clipboard fails", async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(false);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(copyTextToClipboard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Copiado")).not.toBeInTheDocument();
  });

  it("closes from the button", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
