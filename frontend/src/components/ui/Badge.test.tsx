import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnreadBadge } from "./Badge";

describe("UnreadBadge", () => {
  it("renders nothing if count is 0 or negative", () => {
    const { container, rerender } = render(<UnreadBadge count={0} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<UnreadBadge count={-5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders exact count when count is between 1 and 99", () => {
    const { rerender } = render(<UnreadBadge count={1} />);
    expect(screen.getByText("1")).toBeInTheDocument();

    rerender(<UnreadBadge count={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();

    rerender(<UnreadBadge count={99} />);
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("renders '99+' when count exceeds 99", () => {
    render(<UnreadBadge count={100} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<UnreadBadge count={3} className="custom-test-class" />);
    expect(container.querySelector("span")?.className).toContain("custom-test-class");
  });
});
