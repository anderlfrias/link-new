import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSettingsPanel } from "./AdminSettingsPanel";
import { useAdminSettings } from "@/features/admin/hooks/use-admin-settings";
import { useUpdateAdminSettings } from "@/features/admin/hooks/use-update-admin-settings";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";

vi.mock("@/features/admin/hooks/use-admin-settings", () => ({
  useAdminSettings: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-update-admin-settings", () => ({
  useUpdateAdminSettings: vi.fn(),
}));

vi.mock("@/features/admin/components/FileTypeMultiSelect", () => ({
  FileTypeMultiSelect: ({ label }: { label: string }) => (
    <div data-testid="file-type-select">{label}</div>
  ),
}));

describe("AdminSettingsPanel", () => {
  const mockSave = vi.fn();
  const mockRefetch = vi.fn();

  const defaultSettings: AdminSettings = {
    maxUploadSizeMb: 25,
    fileTypeRestrictionMode: "DISABLED",
    fileTypeList: [],
    maxFilesPerMessage: 10,
    allowConversationDelete: true,
    maxVoiceNoteDurationSeconds: 120,
    maxGroupMembers: 50,
    whoCanCreateGroups: "ALL_MEMBERS",
    whoCanAddMembers: "ALL_MEMBERS",
    whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
    whoCanChangeGroupInfo: "ALL_MEMBERS",
    whoCanDeleteGroup: "GROUP_ADMINS_ONLY",
    allowGroupDelete: true,
    allowGroupOverrideAddMembers: true,
    allowGroupOverrideRemoveMembers: true,
    allowGroupOverrideMaxGroupMembers: false,
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUpdateAdminSettings).mockReturnValue({
      save: mockSave,
      pending: false,
      error: null,
    });
  });

  it("renders loading state when status is loading", () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: null,
      status: "loading",
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<AdminSettingsPanel />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders error message and retry button when status is error", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: null,
      status: "error",
      error: "Error cargando config",
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    expect(screen.getByText("Error cargando config")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("renders settings form and respects allowGroupDelete invariant disabling delete selector", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: defaultSettings,
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    expect(screen.getByText("Configuración global")).toBeInTheDocument();

    const allowGroupDeleteCheckbox = screen.getByRole("checkbox", {
      name: "Los grupos se pueden eliminar",
    });
    expect(allowGroupDeleteCheckbox).toBeChecked();

    const deleteGroupLabel = screen.getByText("¿Quién puede eliminar el grupo?");
    const deleteGroupSelect = deleteGroupLabel.closest("label")?.querySelector("select");
    expect(deleteGroupSelect).toBeEnabled();

    // Toggle off allowGroupDelete
    await user.click(allowGroupDeleteCheckbox);
    expect(allowGroupDeleteCheckbox).not.toBeChecked();

    // Invariant: when allowGroupDelete is false, delete selector is disabled
    // (no UI exceptions for app admin)
    expect(deleteGroupSelect).toBeDisabled();
  });

  it("enables save button when changes are made and submits updated payload", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: defaultSettings,
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });

    mockSave.mockResolvedValueOnce({
      ...defaultSettings,
      maxUploadSizeMb: 50,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();

    // Change max upload size
    const uploadInput = screen.getByLabelText(/Tamaño máximo \(MB\)/i);
    await user.clear(uploadInput);
    await user.type(uploadInput, "50");

    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        maxUploadSizeMb: 50,
      }),
    );
  });

  it("permite configurar y guardar opciones de migración progresiva a S3", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: defaultSettings,
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });

    mockSave.mockResolvedValueOnce({
      ...defaultSettings,
      fileMigrationEnabled: true,
      fileMigrationBatchSize: 100,
      fileMigrationIntervalMinutes: 30,
      fileMigrationDeleteLocalAfterCommit: true,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    const enableCheckbox = screen.getByRole("checkbox", {
      name: "Habilitar worker de migración progresiva a S3",
    });
    expect(enableCheckbox).not.toBeChecked();

    await user.click(enableCheckbox);
    expect(enableCheckbox).toBeChecked();

    const batchInput = screen.getByLabelText(/Tamaño del lote de migración/i);
    await user.clear(batchInput);
    await user.type(batchInput, "100");

    const intervalInput = screen.getByLabelText(/Intervalo de ejecución \(minutos\)/i);
    await user.clear(intervalInput);
    await user.type(intervalInput, "30");

    const deleteLocalCheckbox = screen.getByRole("checkbox", {
      name: "Eliminar archivo local tras confirmar subida a S3",
    });
    await user.click(deleteLocalCheckbox);

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        fileMigrationEnabled: true,
        fileMigrationBatchSize: 100,
        fileMigrationIntervalMinutes: 30,
        fileMigrationDeleteLocalAfterCommit: true,
      }),
    );
  });

  it("invalida el formulario si el tamaño de lote de migración excede 500", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: {
        ...defaultSettings,
        fileMigrationEnabled: true,
      },
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    const batchInput = screen.getByLabelText(/Tamaño del lote de migración/i);
    await user.clear(batchInput);
    await user.type(batchInput, "999");

    expect(screen.getByText("Debe ser un número entero entre 1 y 500.")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();
  });

  it("permite configurar y guardar la retención del audit trail", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: defaultSettings,
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });

    mockSave.mockResolvedValueOnce({
      ...defaultSettings,
      auditLogRetentionDays: 90,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    const retentionInput = screen.getByLabelText(/Retención de registros de auditoría/i);
    expect(retentionInput).toHaveValue(null);

    await user.type(retentionInput, "90");

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        auditLogRetentionDays: 90,
      }),
    );
  });

  it("invalida el formulario si la retención del audit trail es menor a 1", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: defaultSettings,
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    const retentionInput = screen.getByLabelText(/Retención de registros de auditoría/i);
    await user.type(retentionInput, "0");

    expect(
      screen.getByText("Debe ser un número entero mayor a 0, o vacío para conservar para siempre."),
    ).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();
  });
});
