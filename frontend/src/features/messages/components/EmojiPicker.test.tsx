import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmojiPicker } from "./EmojiPicker";
import { EMOJI_CATEGORIES } from "@/features/messages/constants/emoji-data";
import { resetFavoritesCache } from "@/features/messages/lib/favorites-store";

describe("EmojiPicker", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFavoritesCache();
  });

  it("renders category tabs and emoji grid", () => {
    render(<EmojiPicker onSelect={vi.fn()} />);

    // First category tab is present
    expect(screen.getByLabelText(EMOJI_CATEGORIES[0].label)).toBeInTheDocument();
    // First emoji of the first category is rendered
    expect(screen.getAllByText(EMOJI_CATEGORIES[0].emojis[0]).length).toBeGreaterThan(0);
    // Favorites tab button is present
    expect(screen.getByLabelText("Emojis favoritos")).toBeInTheDocument();
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

  it("switches to favorites tab and renders default favorite emojis", () => {
    render(<EmojiPicker onSelect={vi.fn()} userId="user-1" />);

    const favTab = screen.getByLabelText("Emojis favoritos");
    fireEvent.click(favTab);

    expect(screen.getAllByText("👍").length).toBeGreaterThan(0);
    expect(screen.getAllByText("❤️").length).toBeGreaterThan(0);
  });

  it("toggles favorite mode and allows adding/removing favorites without selecting", () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} userId="user-1" />);

    const editButton = screen.getByLabelText("Editar favoritos");
    fireEvent.click(editButton);

    expect(screen.getByText(/Tocá cualquier emoji para agregarlo o quitarlo de favoritos/i)).toBeInTheDocument();

    const firstEmoji = EMOJI_CATEGORIES[0].emojis[0];
    const emojiButtons = screen.getAllByText(firstEmoji);
    fireEvent.click(emojiButtons[emojiButtons.length - 1]);

    // Did NOT call onSelect
    expect(onSelect).not.toHaveBeenCalled();
  });
});
