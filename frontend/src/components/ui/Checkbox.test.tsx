import React, { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("renders checkbox with label", () => {
    render(<Checkbox label="Accept terms" />);
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("handles change events when toggled", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<Checkbox label="Enable notifications" onChange={handleChange} />);
    const checkbox = screen.getByRole("checkbox", { name: "Enable notifications" });

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(handleChange).toHaveBeenCalledTimes(1);

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(handleChange).toHaveBeenCalledTimes(2);
  });

  it("forwards ref to HTMLInputElement", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} label="Ref check" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
