import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveUploadSession,
  getUploadSession,
  removeUploadSession,
  clearExpiredSessions,
  type PersistedUploadSession,
} from "./upload-persistence";

describe("upload-persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("guarda y recupera una sesión para una conversación", () => {
    const session: PersistedUploadSession = {
      sessionId: "sess-1",
      conversationId: "conv-1",
      fileName: "video.mp4",
      fileSize: 50 * 1024 * 1024,
      fileType: "video/mp4",
      lastModified: 1700000000000,
      createdAt: Date.now(),
    };

    saveUploadSession(session);

    const retrieved = getUploadSession("conv-1");
    expect(retrieved).toEqual(session);

    // No debe devolver para otra conversación distinta
    expect(getUploadSession("conv-other")).toBeNull();
  });

  it("elimina una sesión guardada", () => {
    const session: PersistedUploadSession = {
      sessionId: "sess-2",
      conversationId: "conv-2",
      fileName: "archivo.iso",
      fileSize: 100 * 1024 * 1024,
      fileType: "application/x-iso9660-image",
      lastModified: 1700000000000,
      createdAt: Date.now(),
    };

    saveUploadSession(session);
    expect(getUploadSession("conv-2")).not.toBeNull();

    removeUploadSession("sess-2");
    expect(getUploadSession("conv-2")).toBeNull();
  });

  it("descarta automáticamente sesiones con más de 24 horas", () => {
    const oldSession: PersistedUploadSession = {
      sessionId: "sess-old",
      conversationId: "conv-3",
      fileName: "viejo.zip",
      fileSize: 10 * 1024 * 1024,
      fileType: "application/zip",
      lastModified: 1700000000000,
      createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25h atrás (> 24h)
    };

    saveUploadSession(oldSession);

    expect(getUploadSession("conv-3")).toBeNull();
  });

  it("maneja errores de JSON o localStorage corrupto de forma transparente", () => {
    window.localStorage.setItem("link_active_upload_sessions", "invalido-json{");

    expect(getUploadSession("conv-4")).toBeNull();

    // Guardar sobre escribe limpiamente
    const newSession: PersistedUploadSession = {
      sessionId: "sess-new",
      conversationId: "conv-4",
      fileName: "nuevo.dat",
      fileSize: 1024,
      fileType: "application/octet-stream",
      lastModified: 1700000000000,
      createdAt: Date.now(),
    };

    saveUploadSession(newSession);
    expect(getUploadSession("conv-4")).toEqual(newSession);
  });
});
