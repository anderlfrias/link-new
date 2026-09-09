import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNewMessageSound } from "./use-new-message-sound";
import { playNotificationSound } from "@/utils/notification-sound";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

vi.mock("@/utils/notification-sound", () => ({
  playNotificationSound: vi.fn(),
}));

describe("useNewMessageSound", () => {
  const baseConversation: ConversationListItem = {
    id: "conv-1",
    name: "Chat 1",
    type: "PRIVATE",
    imageFileId: null,
    imageFile: null,
    createdById: "user-1",
    lastMessageId: "msg-1",
    lastMessageAt: "2026-09-09T10:00:00Z",
    lastMessageSenderId: "user-other",
    createdAt: "2026-09-09T09:00:00Z",
    updatedAt: "2026-09-09T10:00:00Z",
    deletedAt: null,
    members: [],
    unreadCount: 0,
    lastMessageStatus: "read",
    lastMessagePreview: "Hola",
    isPinnedByMe: false,
    isFavoritedByMe: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  it("does not play sound on initial mount (baseline establishment)", () => {
    renderHook(() => useNewMessageSound([baseConversation], "my-user-id", null, true));

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("plays sound when a new message arrives from another user in a non-active chat", () => {
    const { rerender } = renderHook(
      ({ convs }) => useNewMessageSound(convs, "my-user-id", "conv-2", true),
      { initialProps: { convs: [baseConversation] } },
    );

    expect(playNotificationSound).not.toHaveBeenCalled();

    const updated = [{ ...baseConversation, lastMessageId: "msg-2", lastMessageSenderId: "user-other" }];
    rerender({ convs: updated });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("does not play sound if new message was sent by current user", () => {
    const { rerender } = renderHook(
      ({ convs }) => useNewMessageSound(convs, "my-user-id", null, true),
      { initialProps: { convs: [baseConversation] } },
    );

    const updated = [{ ...baseConversation, lastMessageId: "msg-mine", lastMessageSenderId: "my-user-id" }];
    rerender({ convs: updated });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("does not play sound if user is actively viewing the conversation and window is visible", () => {
    const { rerender } = renderHook(
      ({ convs }) => useNewMessageSound(convs, "my-user-id", "conv-1", true),
      { initialProps: { convs: [baseConversation] } },
    );

    const updated = [{ ...baseConversation, lastMessageId: "msg-3", lastMessageSenderId: "user-other" }];
    rerender({ convs: updated });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("plays sound if user has conversation open but window is in background (document.hidden = true)", () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });

    const { rerender } = renderHook(
      ({ convs }) => useNewMessageSound(convs, "my-user-id", "conv-1", true),
      { initialProps: { convs: [baseConversation] } },
    );

    const updated = [{ ...baseConversation, lastMessageId: "msg-bg", lastMessageSenderId: "user-other" }];
    rerender({ convs: updated });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("does not play sound if soundEnabled is false", () => {
    const { rerender } = renderHook(
      ({ convs }) => useNewMessageSound(convs, "my-user-id", null, false),
      { initialProps: { convs: [baseConversation] } },
    );

    const updated = [{ ...baseConversation, lastMessageId: "msg-4", lastMessageSenderId: "user-other" }];
    rerender({ convs: updated });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
