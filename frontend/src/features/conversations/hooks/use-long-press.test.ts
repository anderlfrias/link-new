import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "./use-long-press";

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers onLongPress after specified delay on touch holding", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 400 }));

    act(() => {
      result.current.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 }],
      } as any);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("cancels long press if touch moves beyond moveThreshold (scroll gesture)", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { delay: 500, moveThreshold: 10 }),
    );

    act(() => {
      result.current.onTouchStart({
        touches: [{ clientX: 50, clientY: 50 }],
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(200);
      result.current.onTouchMove({
        touches: [{ clientX: 50, clientY: 65 }], // delta Y = 15 > threshold (10)
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels long press if touch ends before delay expires", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }));

    act(() => {
      result.current.onTouchStart({
        touches: [{ clientX: 50, clientY: 50 }],
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(200);
      result.current.onTouchEnd({
        preventDefault: vi.fn(),
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("prevents default on touchEnd if long press was already fired", () => {
    const onLongPress = vi.fn();
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }));

    act(() => {
      result.current.onTouchStart({
        touches: [{ clientX: 50, clientY: 50 }],
      } as any);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onTouchEnd({
        preventDefault,
      } as any);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
