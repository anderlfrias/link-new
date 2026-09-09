import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MessageStatusTicks } from "./MessageStatusTicks";

describe("MessageStatusTicks", () => {
  it("renders null if status is null", () => {
    const { container } = render(<MessageStatusTicks status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders single check icon for sent status", () => {
    const { container } = render(<MessageStatusTicks status="sent" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains("tabler-icon-check")).toBe(true);
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("text-neutral-400");
  });

  it("renders double check icon for delivered status", () => {
    const { container } = render(<MessageStatusTicks status="delivered" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains("tabler-icon-checks")).toBe(true);
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("text-neutral-400");
  });

  it("renders double check icon with brand blue for read status (default tone)", () => {
    const { container } = render(<MessageStatusTicks status="read" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains("tabler-icon-checks")).toBe(true);
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("text-brand-blue");
  });

  it("applies onBrand tone correctly for sent, delivered, and read", () => {
    const { container, rerender } = render(
      <MessageStatusTicks status="sent" tone="onBrand" />,
    );
    let svg = container.querySelector("svg");
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("text-white/70");

    rerender(<MessageStatusTicks status="delivered" tone="onBrand" />);
    svg = container.querySelector("svg");
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("text-white/70");

    rerender(<MessageStatusTicks status="read" tone="onBrand" />);
    svg = container.querySelector("svg");
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("text-white");
  });
});
