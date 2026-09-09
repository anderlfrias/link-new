import React, { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select";

describe("Select", () => {
  it("renders select element with options and handles value change", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Select onChange={handleChange} defaultValue="opt1" aria-label="Opciones">
        <option value="opt1">Opción 1</option>
        <option value="opt2">Opción 2</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "Opciones" });
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("opt1");

    await user.selectOptions(select, "opt2");
    expect(select).toHaveValue("opt2");
    expect(handleChange).toHaveBeenCalled();
  });

  it("displays error message and applies red border styles when error is provided", () => {
    render(
      <Select error="Seleccione una opción válida">
        <option value="">Seleccione</option>
      </Select>,
    );

    expect(screen.getByText("Seleccione una opción válida")).toBeInTheDocument();
    const select = screen.getByRole("combobox");
    expect(select.className).toContain("border-red-500");
  });

  it("forwards ref to HTMLSelectElement", () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref}>
        <option value="val">Val</option>
      </Select>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
