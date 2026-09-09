import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyConversationState } from "./EmptyConversationState";

describe("EmptyConversationState", () => {
  it("renders brand logo icon and placeholder invitation text", () => {
    render(<EmptyConversationState />);

    expect(screen.getByRole("img", { name: "Link" })).toBeInTheDocument();
    expect(screen.getByText("Link", { selector: "p" })).toBeInTheDocument();
    expect(
      screen.getByText("Seleccioná una conversación para empezar a chatear."),
    ).toBeInTheDocument();
  });
});
