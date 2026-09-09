import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmojiPicker } from "./EmojiPicker";
import { EMOJI_CATEGORIES } from "@/features/messages/constants/emoji-data";

describe("EmojiPicker", () => {
  it("renders category tabs and emoji grid", () => {
    render(<EmojiPicker onSelect={vi.fn()} />);

    // First category tab is present
    expect(screen.getByLabelText(EMOJI_CATEGORIES[0].label)).toBeInTheDocument();
    // First emoji of the first category is rendered
    expect(screen.getAllByText(EMOJI_CATEGORIES[0].emojis[0]).length).toBeGreaterThan(0);
  });

  it("calls onSelect when an emoji is clicked", () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} />);

    const firstEmoji = EMOJI_CATEGORIES[0].emojis[0];
    const emojiElements = screen.getAllByText(firstEmoji);
    fireEvent.click(emojiElements[emojiElements.length - 1]);

    expect(onSelect).toHaveBeenCalledWith(firstEmoji);
  });

  it("switches category and displays its emojis when tab is clicked", () => {
    render(<EmojiPicker onSelect={vi.fn()} />);

    if (EMOJI_CATEGORIES.length > 1) {
      const secondCat = EMOJI_CATEGORIES[1];
      const secondTab = screen.getByLabelText(secondCat.label);
      fireEvent.click(secondTab);

      expect(screen.getAllByText(secondCat.emojis[0]).length).toBeGreaterThan(0);
    }
  });
});
