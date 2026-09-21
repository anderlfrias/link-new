import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDraft,
  setDraft,
  clearDraft,
  subscribeDraft,
  resetDraftCache,
} from "./draft-store";

describe("draft-store", () => {
  const userId1 = "user-1";
  const userId2 = "user-2";
  const conv1 = "conv-1";
  const conv2 = "conv-2";

  beforeEach(() => {
    localStorage.clear();
    resetDraftCache();
    vi.clearAllMocks();
  });

  it("retorna string vacío si no hay borrador", () => {
    expect(getDraft(userId1, conv1)).toBe("");
  });

  it("guarda y recupera un borrador para una conversación", () => {
    setDraft(userId1, conv1, "Hola, esto es un borrador");
    expect(getDraft(userId1, conv1)).toBe("Hola, esto es un borrador");

    // Debe persistir en localStorage
    const stored = JSON.parse(localStorage.getItem(`link_drafts_${userId1}`)!);
    expect(stored[conv1]).toBe("Hola, esto es un borrador");
  });

  it("aísla borradores entre conversaciones distintas del mismo usuario", () => {
    setDraft(userId1, conv1, "Borrador chat 1");
    setDraft(userId1, conv2, "Borrador chat 2");

    expect(getDraft(userId1, conv1)).toBe("Borrador chat 1");
    expect(getDraft(userId1, conv2)).toBe("Borrador chat 2");
  });

  it("aísla borradores entre diferentes usuarios", () => {
    setDraft(userId1, conv1, "Mensaje privado de user 1");
    expect(getDraft(userId2, conv1)).toBe("");

    setDraft(userId2, conv1, "Mensaje de user 2");
    expect(getDraft(userId1, conv1)).toBe("Mensaje privado de user 1");
    expect(getDraft(userId2, conv1)).toBe("Mensaje de user 2");
  });

  it("elimina el borrador si se guarda texto vacío o solo con espacios", () => {
    setDraft(userId1, conv1, "Texto inicial");
    expect(getDraft(userId1, conv1)).toBe("Texto inicial");

    setDraft(userId1, conv1, "   ");
    expect(getDraft(userId1, conv1)).toBe("");
    expect(localStorage.getItem(`link_drafts_${userId1}`)).toBeNull();
  });

  it("clearDraft elimina el borrador correctamente", () => {
    setDraft(userId1, conv1, "Para borrar");
    clearDraft(userId1, conv1);

    expect(getDraft(userId1, conv1)).toBe("");
  });

  it("notifica a los suscriptores cuando cambia el borrador", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDraft(userId1, conv1, listener);

    setDraft(userId1, conv1, "Nuevo texto");
    expect(listener).toHaveBeenCalledTimes(1);

    setDraft(userId1, conv1, "Otro cambio");
    expect(listener).toHaveBeenCalledTimes(2);

    // No debe notificar si el texto no cambia
    setDraft(userId1, conv1, "Otro cambio");
    expect(listener).toHaveBeenCalledTimes(2);

    // No debe notificar si cambia otra conversación
    setDraft(userId1, conv2, "Chat 2");
    expect(listener).toHaveBeenCalledTimes(2);

    // Al desuscribirse no vuelve a recibir notificaciones
    unsubscribe();
    setDraft(userId1, conv1, "Después de desuscribirse");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("maneja storage corrupto sin lanzar errores", () => {
    localStorage.setItem(`link_drafts_${userId1}`, "invalid json{{{");
    expect(getDraft(userId1, conv1)).toBe("");

    // Debe permitir sobreescribir limpiamente
    setDraft(userId1, conv1, "Recuperado");
    expect(getDraft(userId1, conv1)).toBe("Recuperado");
  });

  it("reacciona al evento 'storage' de otra pestaña", () => {
    setDraft(userId1, conv1, "En pestaña actual");

    const listener = vi.fn();
    subscribeDraft(userId1, conv1, listener);

    // Simular que otra pestaña actualizó el storage
    localStorage.setItem(`link_drafts_${userId1}`, JSON.stringify({ [conv1]: "Desde otra pestaña" }));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: `link_drafts_${userId1}`,
      }),
    );

    expect(listener).toHaveBeenCalled();
    expect(getDraft(userId1, conv1)).toBe("Desde otra pestaña");
  });
});
