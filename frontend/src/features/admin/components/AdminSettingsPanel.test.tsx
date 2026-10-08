import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSettingsPanel } from "./AdminSettingsPanel";
import { useAdminSettings } from "@/features/admin/hooks/use-admin-settings";
import { useUpdateAdminSettings } from "@/features/admin/hooks/use-update-admin-settings";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";
import { deriveAuthCapabilities, useAuthCapabilities } from "@/providers/auth-config-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { createMockAuthConfig, createMockPublicSettings } from "@/test/test-utils";

vi.mock("@/features/admin/hooks/use-admin-settings", () => ({
  useAdminSettings: vi.fn(),
}));

// Si las contraseñas se administran acá lo decide `GET /auth/config`: cada test elige el proveedor.
vi.mock("@/providers/auth-config-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/providers/auth-config-provider")>()),
  useAuthCapabilities: vi.fn(),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: vi.fn(),
}));

function mockProvider(kind: "local" | "external") {
  vi.mocked(useAuthCapabilities).mockReturnValue(deriveAuthCapabilities(createMockAuthConfig(kind)));
}

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
    whoCanLeaveGroup: "ALL_MEMBERS",
    allowGroupOverrideAddMembers: true,
    allowGroupOverrideRemoveMembers: true,
    allowGroupOverrideMaxGroupMembers: false,
    allowGroupOverrideChangeGroupInfo: true,
    allowGroupOverrideDeleteGroup: false,
    allowGroupOverrideLeaveGroup: false,
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
    localSessionTtlHours: 12,
    passwordMinLength: 12,
    passwordRequireUppercase: false,
    passwordRequireLowercase: false,
    passwordRequireNumber: false,
    passwordRequireSymbol: false,
    passwordExpirationDays: null,
    passwordHistoryCount: 0,
    maxFailedLoginAttempts: null,
    lockoutDurationMinutes: 15,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider("external");
    vi.mocked(usePublicSettings).mockReturnValue(null);
    vi.mocked(useUpdateAdminSettings).mockReturnValue({
      save: mockSave,
      pending: false,
      error: null,
    });
  });

  describe("nota del tamaño máximo sin almacenamiento S3", () => {
    function renderReady() {
      vi.mocked(useAdminSettings).mockReturnValue({
        settings: { ...defaultSettings, maxUploadSizeMb: 2048 },
        status: "ready",
        error: null,
        refetch: mockRefetch,
      });
      render(<AdminSettingsPanel />);
    }

    it("aparece cuando no hay subida por partes (sin S3)", () => {
      vi.mocked(usePublicSettings).mockReturnValue(createMockPublicSettings({ chunkedUploads: false }));

      renderReady();

      expect(screen.getByTestId("max-upload-no-s3-note")).toHaveTextContent("32 MB");
      // El campo conserva el valor configurado: la nota explica por qué no se alcanza.
      expect(screen.getByLabelText(/Tamaño máximo \(MB\)/)).toHaveValue(2048);
    });

    it("no aparece con almacenamiento S3", () => {
      vi.mocked(usePublicSettings).mockReturnValue(createMockPublicSettings({ chunkedUploads: true }));

      renderReady();

      expect(screen.queryByTestId("max-upload-no-s3-note")).not.toBeInTheDocument();
    });

    it("no aparece mientras los ajustes públicos no cargaron", () => {
      vi.mocked(usePublicSettings).mockReturnValue(null);

      renderReady();

      expect(screen.queryByTestId("max-upload-no-s3-note")).not.toBeInTheDocument();
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

  it("permite cambiar quién puede salir del grupo y su override", async () => {
    vi.mocked(useAdminSettings).mockReturnValue({
      settings: defaultSettings,
      status: "ready",
      error: null,
      refetch: mockRefetch,
    });
    mockSave.mockResolvedValueOnce({
      ...defaultSettings,
      whoCanLeaveGroup: "GROUP_ADMINS_ONLY",
      allowGroupOverrideLeaveGroup: true,
    });

    const user = userEvent.setup();
    render(<AdminSettingsPanel />);

    const leaveGroupLabel = screen.getByText("¿Quién puede salir del grupo?");
    const leaveGroupSelect = leaveGroupLabel.closest("label")?.querySelector("select")!;
    expect(leaveGroupSelect).toHaveValue("ALL_MEMBERS");

    await user.selectOptions(leaveGroupSelect, "GROUP_ADMINS_ONLY");

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        whoCanLeaveGroup: "GROUP_ADMINS_ONLY",
      }),
    );
  });

  describe("Sesión y contraseñas", () => {
    function renderWith(settings: AdminSettings = defaultSettings) {
      vi.mocked(useAdminSettings).mockReturnValue({
        settings,
        status: "ready",
        error: null,
        refetch: mockRefetch,
      });
      mockSave.mockResolvedValueOnce(settings);
      return { user: userEvent.setup(), ...render(<AdminSettingsPanel />) };
    }

    async function replace(user: ReturnType<typeof userEvent.setup>, label: RegExp, value: string) {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      if (value) await user.type(input, value);
    }

    it("con un proveedor externo muestra la duración de la sesión (es de LINK) pero no las contraseñas, y no las envía", async () => {
      const { user } = renderWith();
      expect(screen.getByTestId("session-settings")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Sesión" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Duración de la sesión/)).toHaveValue(12);
      expect(screen.queryByTestId("password-settings")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Largo mínimo de la contraseña/)).not.toBeInTheDocument();

      await replace(user, /Duración de la sesión/, "8");
      await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

      const payload = mockSave.mock.calls[0][0];
      expect(payload.localSessionTtlHours).toBe(8);
      expect(payload).not.toHaveProperty("passwordMinLength");
      expect(payload).not.toHaveProperty("passwordRequireUppercase");
      expect(payload).not.toHaveProperty("passwordExpirationDays");
      expect(payload).not.toHaveProperty("passwordHistoryCount");
      expect(payload).not.toHaveProperty("maxFailedLoginAttempts");
      expect(payload).not.toHaveProperty("lockoutDurationMinutes");
    });

    it("con un proveedor externo valida el rango de la duración de la sesión", async () => {
      const { user } = renderWith();

      await replace(user, /Duración de la sesión/, "721");

      expect(screen.getByText("Debe ser un número entero entre 1 y 720.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    });

    it("con un proveedor externo también advierte que bajar la duración corta las sesiones abiertas", async () => {
      const { user } = renderWith();

      await replace(user, /Duración de la sesión/, "4");

      expect(screen.getByTestId("session-warnings")).toHaveTextContent("también cierra las sesiones abiertas");
    });

    it("con cuentas locales aparecen la sesión y las contraseñas, con los valores guardados", () => {
      mockProvider("local");
      renderWith({ ...defaultSettings, passwordMinLength: 14, passwordRequireSymbol: true, maxFailedLoginAttempts: 5 });

      expect(screen.getByRole("heading", { name: "Sesión" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Contraseñas" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Duración de la sesión/)).toHaveValue(12);
      expect(screen.getByLabelText(/Largo mínimo de la contraseña/)).toHaveValue(14);
      expect(screen.getByRole("checkbox", { name: "Un símbolo" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Una mayúscula" })).not.toBeChecked();
      expect(screen.getByLabelText(/Vencimiento de la contraseña/)).toHaveValue(null);
      expect(screen.getByLabelText(/Intentos fallidos seguidos/)).toHaveValue(5);
      expect(screen.getByText(/puede deducir que una cuenta existe/)).toBeInTheDocument();
      expect(screen.queryByTestId("session-warnings")).not.toBeInTheDocument();
      expect(screen.queryByTestId("password-warnings")).not.toBeInTheDocument();
    });

    it.each([
      [/Duración de la sesión/, "0", "Debe ser un número entero entre 1 y 720."],
      [/Duración de la sesión/, "721", "Debe ser un número entero entre 1 y 720."],
      [/Largo mínimo de la contraseña/, "7", "Debe ser un número entero entre 8 y 128."],
      [/Largo mínimo de la contraseña/, "129", "Debe ser un número entero entre 8 y 128."],
      [/Contraseñas recientes/, "13", "Debe ser un número entero entre 0 y 12."],
      [/Vencimiento de la contraseña/, "366", "Debe ser un número entero entre 1 y 365, o vacío."],
      [/Intentos fallidos seguidos/, "2", "Debe ser un número entero entre 3 y 50, o vacío."],
    ])("valida el rango de %s con %s", async (label, value, message) => {
      mockProvider("local");
      const { user } = renderWith();

      await replace(user, label, value);

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    });

    it("valida la duración del bloqueo solo si el bloqueo está activo", async () => {
      mockProvider("local");
      const { user } = renderWith({ ...defaultSettings, maxFailedLoginAttempts: 5 });

      await replace(user, /Duración del bloqueo/, "1441");
      expect(screen.getByText("Debe ser un número entero entre 1 y 1440.")).toBeInTheDocument();

      await replace(user, /Intentos fallidos seguidos/, "");
      expect(screen.getByLabelText(/Duración del bloqueo/)).toBeDisabled();
      expect(screen.queryByText("Debe ser un número entero entre 1 y 1440.")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
      const payload = mockSave.mock.calls[0][0];
      expect(payload.maxFailedLoginAttempts).toBeNull();
      expect(payload).not.toHaveProperty("lockoutDurationMinutes");
    });

    it("guarda los campos convertidos, con vacío como null", async () => {
      mockProvider("local");
      const { user } = renderWith({ ...defaultSettings, passwordExpirationDays: 90 });

      await replace(user, /Duración de la sesión/, "24");
      await replace(user, /Vencimiento de la contraseña/, "");
      await replace(user, /Contraseñas recientes/, "3");
      await replace(user, /Intentos fallidos seguidos/, "10");
      await replace(user, /Duración del bloqueo/, "30");
      await user.click(screen.getByRole("checkbox", { name: "Un número" }));
      await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          localSessionTtlHours: 24,
          passwordMinLength: 12,
          passwordRequireNumber: true,
          passwordExpirationDays: null,
          passwordHistoryCount: 3,
          maxFailedLoginAttempts: 10,
          lockoutDurationMinutes: 30,
        }),
      );
    });

    it("advierte que bajar la duración corta las sesiones abiertas", async () => {
      mockProvider("local");
      const { user } = renderWith();

      await replace(user, /Duración de la sesión/, "24");
      expect(screen.queryByTestId("session-warnings")).not.toBeInTheDocument();

      await replace(user, /Duración de la sesión/, "4");
      expect(screen.getByText(/también cierra las sesiones abiertas/)).toBeInTheDocument();
    });

    it("advierte que endurecer la política se aplica en el próximo inicio de sesión", async () => {
      mockProvider("local");
      const { user } = renderWith();

      await user.click(screen.getByRole("checkbox", { name: "Una mayúscula" }));
      expect(screen.getByText(/en su próximo inicio de sesión/)).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: "Una mayúscula" }));
      expect(screen.queryByTestId("password-warnings")).not.toBeInTheDocument();

      await replace(user, /Largo mínimo de la contraseña/, "16");
      expect(screen.getByText(/en su próximo inicio de sesión/)).toBeInTheDocument();
    });

    it("advierte al activar o acortar el vencimiento, no al alargarlo", async () => {
      mockProvider("local");
      const { user } = renderWith({ ...defaultSettings, passwordExpirationDays: 90 });

      await replace(user, /Vencimiento de la contraseña/, "180");
      expect(screen.queryByTestId("password-warnings")).not.toBeInTheDocument();

      await replace(user, /Vencimiento de la contraseña/, "30");
      expect(screen.getByText(/más antiguas que el vencimiento/)).toBeInTheDocument();
    });
  });
});
