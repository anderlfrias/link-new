import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMessageGestures } from "./use-message-gestures";

describe("useMessageGestures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers onLongPress after delay when held still", () => {
    const onLongPress = vi.fn();
    const onSwipeReply = vi.fn();

    const { result } = renderHook(() =>
      useMessageGestures({ onLongPress, onSwipeReply, longPressDelay: 400 }),
    );

    act(() => {
      result.current.handlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 }],
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onSwipeReply).not.toHaveBeenCalled();
  });

  it("detects right swipe and triggers onSwipeReply if threshold is exceeded on touchEnd", () => {
    const onLongPress = vi.fn();
    const onSwipeReply = vi.fn();

    const { result } = renderHook(() =>
      useMessageGestures({
        onLongPress,
        onSwipeReply,
        moveThreshold: 10,
        swipeThreshold: 50,
        maxSwipeOffset: 70,
      }),
    );

    act(() => {
      result.current.handlers.onTouchStart({
        touches: [{ clientX: 50, clientY: 50 }],
      } as any);
    });

    // Move right horizontally
    act(() => {
      result.current.handlers.onTouchMove({
        touches: [{ clientX: 110, clientY: 52 }], // dx = 60 > 50, dy = 2
      } as any);
    });

    expect(result.current.isSwiping).toBe(true);
    expect(result.current.swipeOffset).toBe(60);

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onSwipeReply).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.isSwiping).toBe(false);
    expect(result.current.swipeOffset).toBe(0);
  });

  it("cancels swiping and long press on vertical scroll gesture", () => {
    const onLongPress = vi.fn();
    const onSwipeReply = vi.fn();

    const { result } = renderHook(() =>
      useMessageGestures({ onLongPress, onSwipeReply, moveThreshold: 10 }),
    );

    act(() => {
      result.current.handlers.onTouchStart({
        touches: [{ clientX: 50, clientY: 50 }],
      } as any);
    });

    // Move vertically (scroll)
    act(() => {
      result.current.handlers.onTouchMove({
        touches: [{ clientX: 52, clientY: 90 }], // dy = 40 >> dx = 2
      } as any);
    });

    expect(result.current.isSwiping).toBe(false);

    act(() => {
      vi.advanceTimersByTime(600);
      result.current.handlers.onTouchEnd();
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onSwipeReply).not.toHaveBeenCalled();
  });

  it("does nothing when disabled is true", () => {
    const onLongPress = vi.fn();
    const onSwipeReply = vi.fn();

    const { result } = renderHook(() =>
      useMessageGestures({ onLongPress, onSwipeReply, disabled: true }),
    );

    act(() => {
      result.current.handlers.onTouchStart({
        touches: [{ clientX: 50, clientY: 50 }],
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(600);
      result.current.handlers.onTouchEnd();
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onSwipeReply).not.toHaveBeenCalled();
  });
});
