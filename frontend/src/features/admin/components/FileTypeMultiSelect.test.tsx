import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FileTypeMultiSelect,
  type FileTypeSelectionItem,
} from "./FileTypeMultiSelect";

describe("FileTypeMultiSelect", () => {
  it("renders label and selected chips", () => {
    const value: FileTypeSelectionItem[] = [
      { type: "category", id: "pdf" },
      { type: "custom", label: "image/svg+xml", patterns: ["image/svg+xml"] },
    ];

    render(
      <FileTypeMultiSelect
        label="Tipos permitidos"
        value={value}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Tipos permitidos")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("image/svg+xml")).toBeInTheDocument();
  });

  it("removes chip when X button is clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    const value: FileTypeSelectionItem[] = [
      { type: "category", id: "pdf" },
      { type: "custom", label: "image/webp", patterns: ["image/webp"] },
    ];

    render(
      <FileTypeMultiSelect
        label="Tipos permitidos"
        value={value}
        onChange={handleChange}
      />,
    );

    const removeBtn = screen.getByRole("button", { name: "Quitar PDF" });
    await user.click(removeBtn);

    expect(handleChange).toHaveBeenCalledWith([
      { type: "custom", label: "image/webp", patterns: ["image/webp"] },
    ]);
  });

  it("adds custom valid MIME type pattern (matching backend regex sync invariant)", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <FileTypeMultiSelect
        label="Tipos permitidos"
        value={[]}
        onChange={handleChange}
      />,
    );

    const input = screen.getByPlaceholderText(/Buscar, o escribir/i);
    await user.click(input);
    await user.type(input, "image/avif");

    const option = await screen.findByRole("button", { name: /Agregar "image\/avif"/i });
    await user.click(option);

    expect(handleChange).toHaveBeenCalledWith([
      { type: "custom", label: "image/avif", patterns: ["image/avif"] },
    ]);
  });
});
