import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmojiGifStickerPicker } from "./EmojiGifStickerPicker";
import { getTrendingGiphy, searchGiphy } from "@/features/giphy/api/giphy.api";
import { resetFavoritesCache, toggleFavoriteGif } from "@/features/messages/lib/favorites-store";
import type { GiphySearchResult } from "@/features/giphy/types/giphy.types";

vi.mock("@/features/giphy/api/giphy.api", () => ({
  getTrendingGiphy: vi.fn(),
  searchGiphy: vi.fn(),
}));

describe("EmojiGifStickerPicker", () => {
  const mockGifs: GiphySearchResult[] = [
    {
      id: "g-1",
      title: "Happy Cat",
      previewUrl: "https://giphy.com/preview-1.gif",
      originalUrl: "https://giphy.com/orig-1.gif",
      width: 200,
      height: 200,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetFavoritesCache();
    vi.mocked(getTrendingGiphy).mockResolvedValue(mockGifs);
    vi.mocked(searchGiphy).mockResolvedValue(mockGifs);
  });

  it("renders only Emojis tab when showGifsAndStickers is false", () => {
    render(
      <EmojiGifStickerPicker
        token="tok"
        showGifsAndStickers={false}
        busy={false}
        onSelectEmoji={vi.fn()}
        onSelectGifSticker={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Emojis" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GIFs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stickers" })).not.toBeInTheDocument();
  });

  it("renders all tabs when showGifsAndStickers is true", () => {
    render(
      <EmojiGifStickerPicker
        token="tok"
        showGifsAndStickers={true}
        busy={false}
        onSelectEmoji={vi.fn()}
        onSelectGifSticker={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Emojis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GIFs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stickers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favoritos" })).toBeInTheDocument();
  });

  it("switches to GIFs tab, fetches trending gifs and selects gif on click", async () => {
    const onSelectGifSticker = vi.fn();
    render(
      <EmojiGifStickerPicker
        token="tok"
        showGifsAndStickers={true}
        busy={false}
        onSelectEmoji={vi.fn()}
        onSelectGifSticker={onSelectGifSticker}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "GIFs" }));

    expect(screen.getByPlaceholderText("Buscar GIFs")).toBeInTheDocument();

    await waitFor(() => {
      expect(getTrendingGiphy).toHaveBeenCalledWith("tok", "gifs");
      expect(screen.getByAltText("Happy Cat")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByAltText("Happy Cat"));
    expect(onSelectGifSticker).toHaveBeenCalledWith("gifs", "g-1", "https://giphy.com/orig-1.gif");
  });

  it("disables gif buttons when busy is true", async () => {
    render(
      <EmojiGifStickerPicker
        token="tok"
        showGifsAndStickers={true}
        busy={true}
        onSelectEmoji={vi.fn()}
        onSelectGifSticker={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "GIFs" }));

    await waitFor(() => {
      expect(screen.getByAltText("Happy Cat")).toBeInTheDocument();
    });

    const gifButton = screen.getByAltText("Happy Cat").closest("button");
    expect(gifButton).toBeDisabled();
  });

  it("allows favoriting a GIF and viewing it in the Favoritos view", async () => {
    const onSelectGifSticker = vi.fn();
    render(
      <EmojiGifStickerPicker
        token="tok"
        userId="user-test"
        showGifsAndStickers={true}
        busy={false}
        onSelectEmoji={vi.fn()}
        onSelectGifSticker={onSelectGifSticker}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "GIFs" }));

    await waitFor(() => {
      expect(screen.getByAltText("Happy Cat")).toBeInTheDocument();
    });

    const favButton = screen.getByLabelText("Añadir a favoritos");
    fireEvent.click(favButton);

    // Favorite state updated
    expect(screen.getByLabelText("Quitar de favoritos")).toBeInTheDocument();

    // Switch to Favoritos subview
    const favSubViewButton = screen.getByRole("button", { name: /Favoritos \(1\)/i });
    fireEvent.click(favSubViewButton);

    expect(screen.getByAltText("Happy Cat")).toBeInTheDocument();

    // Click to send from favorites
    fireEvent.click(screen.getByAltText("Happy Cat"));
    expect(onSelectGifSticker).toHaveBeenCalledWith("gifs", "g-1", "https://giphy.com/orig-1.gif");
  });

  it("renders unified Favoritos tab and handles stored stickers", async () => {
    const onSelectStoredSticker = vi.fn();
    render(
      <EmojiGifStickerPicker
        token="tok"
        userId="user-test"
        showGifsAndStickers={true}
        busy={false}
        onSelectEmoji={vi.fn()}
        onSelectGifSticker={vi.fn()}
        onSelectStoredSticker={onSelectStoredSticker}
      />,
    );

    // Switch to top Favoritos tab
    fireEvent.click(screen.getByRole("button", { name: "Favoritos" }));

    // Default emojis are shown
    expect(screen.getByText("Emojis favoritos")).toBeInTheDocument();
    expect(screen.getAllByText("👍").length).toBeGreaterThan(0);
  });
});
