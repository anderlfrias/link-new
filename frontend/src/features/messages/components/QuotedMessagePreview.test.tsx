import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuotedMessagePreview } from "./QuotedMessagePreview";

describe("QuotedMessagePreview", () => {
  it("renders in composer variant with cancel button", () => {
    const onCancel = vi.fn();
    render(
      <QuotedMessagePreview
        senderName="Carlos"
        preview="Mensaje original"
        isDeleted={false}
        variant="composer"
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Carlos")).toBeInTheDocument();
    expect(screen.getByText("Mensaje original")).toBeInTheDocument();

    const cancelBtn = screen.getByLabelText("Cancelar respuesta");
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders in bubble variant as a clickable button", () => {
    const onClick = vi.fn();
    render(
      <QuotedMessagePreview
        senderName="Lucia"
        preview="Cita dentro de burbuja"
        isDeleted={false}
        variant="bubble"
        onClick={onClick}
      />,
    );

    expect(screen.getByText("Lucia")).toBeInTheDocument();
    expect(screen.getByText("Cita dentro de burbuja")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cancelar respuesta")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies italic style when isDeleted is true", () => {
    render(
      <QuotedMessagePreview
        senderName="Carlos"
        preview="Mensaje eliminado"
        isDeleted={true}
        variant="composer"
      />,
    );

    const previewSpan = screen.getByText("Mensaje eliminado");
    expect(previewSpan.className).toContain("italic");
  });
});
