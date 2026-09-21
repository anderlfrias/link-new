import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraft } from "./use-draft";
import { setDraft, clearDraft, resetDraftCache } from "@/features/messages/lib/draft-store";

const mockSession = {
  user: {
    internalUserId: "user-test-1",
  },
};

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    session: mockSession,
  }),
}));

describe("useDraft", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDraftCache();
    vi.clearAllMocks();
  });

  it("devuelve string vacío si no existe borrador", () => {
    const { result } = renderHook(() => useDraft("conv-1"));
    expect(result.current).toBe("");
  });

  it("devuelve el borrador existente si ya fue guardado", () => {
    setDraft("user-test-1", "conv-1", "Borrador previo");
    const { result } = renderHook(() => useDraft("conv-1"));
    expect(result.current).toBe("Borrador previo");
  });

  it("actualiza reactivamente cuando se guarda o modifica un borrador", () => {
    const { result } = renderHook(() => useDraft("conv-1"));
    expect(result.current).toBe("");

    act(() => {
      setDraft("user-test-1", "conv-1", "Escribiendo texto...");
    });
    expect(result.current).toBe("Escribiendo texto...");

    act(() => {
      setDraft("user-test-1", "conv-1", "Texto modificado");
    });
    expect(result.current).toBe("Texto modificado");
  });

  it("actualiza a vacío cuando se limpia el borrador", () => {
    setDraft("user-test-1", "conv-1", "Texto a eliminar");
    const { result } = renderHook(() => useDraft("conv-1"));
    expect(result.current).toBe("Texto a eliminar");

    act(() => {
      clearDraft("user-test-1", "conv-1");
    });
    expect(result.current).toBe("");
  });

  it("respeta overrideUserId si es provisto", () => {
    setDraft("user-override", "conv-1", "Borrador de otro usuario");
    const { result } = renderHook(() => useDraft("conv-1", "user-override"));
    expect(result.current).toBe("Borrador de otro usuario");
  });
});
