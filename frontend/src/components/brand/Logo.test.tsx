import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders logo image and text wordmark by default (full variant)", () => {
    render(<Logo />);

    const img = screen.getByRole("img", { name: "Link" });
    expect(img).toBeInTheDocument();
    expect(screen.getByText("Link", { selector: "span" })).toBeInTheDocument();
  });

  it("renders only logo image and no text wordmark when variant is 'icon'", () => {
    render(<Logo variant="icon" />);

    const img = screen.getByRole("img", { name: "Link" });
    expect(img).toBeInTheDocument();
    expect(screen.queryByText("Link", { selector: "span" })).not.toBeInTheDocument();
  });
});
