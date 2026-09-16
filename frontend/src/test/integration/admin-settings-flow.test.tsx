import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSettingsPanel } from "@/features/admin/components/AdminSettingsPanel";
import { useAdminSettings } from "@/features/admin/hooks/use-admin-settings";
import { useUpdateAdminSettings } from "@/features/admin/hooks/use-update-admin-settings";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";

const mockUseAdminSettings = vi.fn();
vi.mock("@/features/admin/hooks/use-admin-settings", () => ({
  useAdminSettings: () => mockUseAdminSettings(),
}));

const mockSave = vi.fn();
vi.mock("@/features/admin/hooks/use-update-admin-settings", () => ({
  useUpdateAdminSettings: () => ({
    save: mockSave,
    pending: false,
    error: null,
  }),
}));

const initialSettings: AdminSettings = {
  maxUploadSizeMb: 25,
  fileTypeRestrictionMode: "DISABLED",
  fileTypeList: ["image/*", "application/pdf"],
  maxFilesPerMessage: 10,
  allowConversationDelete: true,
  maxVoiceNoteDurationSeconds: 120,
  maxGroupMembers: 100,
  whoCanCreateGroups: "ALL_MEMBERS",
  whoCanAddMembers: "ALL_MEMBERS",
  whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
  whoCanChangeGroupInfo: "GROUP_ADMINS_ONLY",
  whoCanDeleteGroup: "CREATOR_ONLY",
  allowGroupDelete: true,
  allowGroupOverrideAddMembers: true,
  allowGroupOverrideRemoveMembers: true,
  allowGroupOverrideMaxGroupMembers: true,
  allowGroupOverrideChangeGroupInfo: true,
  allowGroupOverrideDeleteGroup: false,
  messageRetentionDays: null,
  allowMessageEdit: true,
  messageEditTimeLimitMinutes: 15,
  allowMessageDeleteForEveryone: true,
  messageDeleteForEveryoneTimeLimitMinutes: 60,
  allowStickersAndGifs: true,
  uploadCleanupEnabled: false,
  orphanFileRetentionHours: null,
  softDeletedFilePurgeDays: null,
  uploadCleanupDryRun: false,
  auditLogRetentionDays: null,
  fileMigrationEnabled: false,
  fileMigrationBatchSize: 50,
  fileMigrationIntervalMinutes: 60,
  fileMigrationDeleteLocalAfterCommit: false,
};

describe("Flujo clave: AdminSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminSettings.mockReturnValue({
      settings: initialSettings,
      status: "ready",
      error: null,
      refetch: vi.fn(),
    });
  });

  it("monta, muestra settings cargados, togglear allowGroupDelete habilita Guardar cambios y envía payload actualizado", async () => {
    const user = userEvent.setup();
    mockSave.mockResolvedValueOnce({
      ...initialSettings,
      allowGroupDelete: false,
    });

    render(<AdminSettingsPanel />);

    // Verifica que montó y muestra los settings iniciales
    expect(screen.getByRole("heading", { name: "Configuración global" })).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    // Inicialmente no está dirty, así que el botón está deshabilitado
    expect(saveButton).toBeDisabled();

    // Togglear allowGroupDelete ("Los grupos se pueden eliminar")
    const allowGroupDeleteCheckbox = screen.getByRole("checkbox", {
      name: "Los grupos se pueden eliminar",
    });
    expect(allowGroupDeleteCheckbox).toBeChecked();

    await user.click(allowGroupDeleteCheckbox);
    expect(allowGroupDeleteCheckbox).not.toBeChecked();

    // Ahora está dirty, el botón se habilita
    expect(saveButton).not.toBeDisabled();

    // Guardar cambios
    await user.click(saveButton);

    // Verifica que save fue llamado con allowGroupDelete: false
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        allowGroupDelete: false,
      }),
    );
  });
});
