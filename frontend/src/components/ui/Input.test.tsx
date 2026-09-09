import React, { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input", () => {
  it("renders input element with standard attributes", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Input
        placeholder="Escribe tu mensaje..."
        onChange={handleChange}
      />,
    );

    const input = screen.getByPlaceholderText("Escribe tu mensaje...");
    expect(input).toBeInTheDocument();

    await user.type(input, "Hola");
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders left icon and rightElement when provided", () => {
    render(
      <Input
        placeholder="Buscar"
        icon={<span data-testid="left-icon">🔍</span>}
        rightElement={<button data-testid="right-btn">Clear</button>}
      />,
    );

    expect(screen.getByTestId("left-icon")).toBeInTheDocument();
    expect(screen.getByTestId("right-btn")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Buscar");
    expect(input.className).toContain("pl-10");
    expect(input.className).toContain("pr-10");
  });

  it("displays error message and applies red border styles when error is provided", () => {
    render(<Input placeholder="Email" error="El email es requerido" />);

    expect(screen.getByText("El email es requerido")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Email");
    expect(input.className).toContain("border-red-500");
  });

  it("forwards ref to HTMLInputElement", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="Ref" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
