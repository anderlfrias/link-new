import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminUserRow } from "./AdminUserRow";
import type { AdminUserListItem } from "@/features/admin/types/admin-users.types";

describe("AdminUserRow", () => {
  const sampleUser: AdminUserListItem = {
    id: "usr-1",
    name: "Dra. María Lopez",
    email: "maria@example.com",
    username: "mlopez",
    createdAt: "2026-01-15T00:00:00.000Z",
    avatarFileId: "f-1",
    avatarFile: { path: "avatars/maria.png" },
    status: "ACTIVE",
    storage: {
      totalSize: 1048576,
      fileCount: 5,
    },
    activity: {
      conversationCount: 12,
      messagesSentCount: 350,
      groupsAdministeredCount: 2,
    },
    syncProfileWithIntegration: true,
  };

  it("renders user information, stats, and synchronization status", () => {
    render(<AdminUserRow user={sampleUser} />);

    expect(screen.getByText(/Dra. María Lopez/i)).toBeInTheDocument();
    expect(screen.getByText(/@mlopez/i)).toBeInTheDocument();
    expect(screen.getByText(/maria@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 MB · 5 archivo\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/12 conversaciones · 350 mensajes/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin de 2 grupo\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("Sincronizado con EXTERNAL_AUTH")).toBeInTheDocument();
  });

  it("displays 'Editado localmente' when syncProfileWithIntegration is false", () => {
    render(<AdminUserRow user={{ ...sampleUser, syncProfileWithIntegration: false }} />);
    expect(screen.getByText("Editado localmente")).toBeInTheDocument();
  });
});
