import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettingsPanel } from "./ProfileSettingsPanel";
import { APP_VERSION } from "@/constants/app-version.constant";
import { createMockAuthConfig } from "@/test/test-utils";
import { deriveAuthCapabilities } from "@/providers/auth-config-provider";

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Si la contraseña se cambia desde LINK lo decide `GET /auth/config`: cada test elige el proveedor.
const mockAuthConfig = vi.fn();
vi.mock("@/providers/auth-config-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/auth-config-provider")>();
  return {
    ...actual,
    useAuthConfig: () => ({ config: mockAuthConfig(), refresh: vi.fn() }),
    useAuthCapabilities: () => actual.deriveAuthCapabilities(mockAuthConfig()),
  };
});

vi.mock("@/features/auth/api/auth.api", () => ({
  changePassword: vi.fn(),
}));

vi.mock("@/features/auth/hooks/use-profile-picture", () => ({
  useProfilePicture: () => ({ url: "https://example.com/avatar.jpg" }),
}));

const mockUpload = vi.fn();
const mockRemove = vi.fn();
vi.mock("@/features/profile/hooks/use-update-profile-picture", () => ({
  useUpdateProfilePicture: () => ({
    upload: mockUpload,
    remove: mockRemove,
    pending: false,
    error: null,
  }),
}));

const mockUpdateName = vi.fn();
vi.mock("@/features/profile/hooks/use-update-profile-name", () => ({
  useUpdateProfileName: () => ({
    updateName: mockUpdateName,
    pending: false,
    error: null,
  }),
}));

const mockSetEnabled = vi.fn();
vi.mock("@/features/profile/hooks/use-update-notification-sound", () => ({
  useUpdateNotificationSound: () => ({
    setEnabled: mockSetEnabled,
    pending: false,
    error: null,
  }),
}));

const mockChangeLanguage = vi.fn();
vi.mock("@/features/profile/hooks/use-update-language", () => ({
  useUpdateLanguage: () => ({
    currentLocale: "es",
    changeLanguage: mockChangeLanguage,
    pending: false,
    error: null,
  }),
}));

describe("ProfileSettingsPanel", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthConfig.mockReturnValue(createMockAuthConfig("external"));
    mockUseAuth.mockReturnValue({
      session: {
        token: "tok-1",
        user: {
          internalUserId: "u-1",
          username: "jperez",
          fullName: "Juan Perez",
          email: "jperez@example.com",
          notificationSoundEnabled: true,
        },
      },
    });
    mockUpdateName.mockResolvedValue(true);
    mockSetEnabled.mockResolvedValue(true);
  });

  it("renderiza información del usuario y botón volver", async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsPanel onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Mi perfil" })).toBeInTheDocument();
    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("Cambiar foto o avatar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("permite editar el nombre", async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsPanel onClose={onClose} />);

    // Click en botón editar nombre
    const editNameBtn = screen.getByRole("button", { name: "Editar mi nombre" });
    await user.click(editNameBtn);

    const input = screen.getByDisplayValue("Juan Perez");
    await user.clear(input);
    await user.type(input, "Juan Carlos Perez");

    const saveBtn = screen.getByRole("button", { name: "Guardar nombre" });
    await user.click(saveBtn);

    expect(mockUpdateName).toHaveBeenCalledWith("Juan Carlos Perez");
  });

  it("permite confirmar la eliminación de la foto de perfil", async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsPanel onClose={onClose} />);

    const deleteBtn = screen.getByRole("button", { name: "Eliminar foto actual" });
    await user.click(deleteBtn);

    // Aparece botón de confirmar eliminación "Eliminar"
    const confirmDeleteBtn = screen.getByRole("button", { name: "Eliminar" });
    await user.click(confirmDeleteBtn);

    expect(mockRemove).toHaveBeenCalled();
  });

  it("permite alternar la preferencia de sonido de notificaciones", async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsPanel onClose={onClose} />);

    const soundCheckbox = screen.getByRole("checkbox", { name: "Reproducir un sonido al recibir mensajes" });
    expect(soundCheckbox).toBeChecked();

    await user.click(soundCheckbox);
    expect(mockSetEnabled).toHaveBeenCalledWith(false);
  });

  it("permite cambiar el idioma usando el selector", async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsPanel onClose={onClose} />);

    const englishBtn = screen.getByRole("radio", { name: /english/i });
    await user.click(englishBtn);

    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
  });

  it("renderiza la versión de la aplicación", () => {
    render(<ProfileSettingsPanel onClose={onClose} />);
    expect(screen.getByText(new RegExp(`Link • v${APP_VERSION.replace(/\\./g, "\\\\.")}`, "i"))).toBeInTheDocument();
  });

  describe("Seguridad: cambiar contraseña (LOCAL_AUTH_PLAN.md, Fase 9)", () => {
    function withProvider(kind: "local" | "external" | null) {
      mockAuthConfig.mockReturnValue(kind ? createMockAuthConfig(kind) : null);
      const completePasswordChange = vi.fn();
      mockUseAuth.mockReturnValue({
        session: {
          token: "tok-1",
          user: {
            internalUserId: "u-1",
            username: "jperez",
            fullName: "Juan Perez",
            email: "jperez@example.com",
            notificationSoundEnabled: true,
          },
        },
        completePasswordChange,
      });
      return completePasswordChange;
    }

    it("con cuentas locales aparece la sección, y el cambio reemplaza el token", async () => {
      const { changePassword } = await import("@/features/auth/api/auth.api");
      vi.mocked(changePassword).mockResolvedValue({ token: "nuevo", exp: 999 });
      const completePasswordChange = withProvider("local");
      const user = userEvent.setup();
      render(<ProfileSettingsPanel onClose={onClose} />);

      expect(screen.getByRole("heading", { name: "Seguridad" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
      await user.type(screen.getByLabelText("Contraseña actual"), "la-de-antes-123");
      await user.type(screen.getByLabelText("Contraseña nueva"), "una frase nueva larga");
      await user.type(screen.getByLabelText("Repetí la contraseña nueva"), "una frase nueva larga");
      await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

      expect(await screen.findByText("Tu contraseña se cambió. Tus otras sesiones se cerraron.")).toBeInTheDocument();
      expect(completePasswordChange).toHaveBeenCalledWith("nuevo", 999);
    });

    it("con un proveedor externo no aparece: la contraseña la administra el proveedor", () => {
      withProvider("external");
      render(<ProfileSettingsPanel onClose={onClose} />);

      expect(screen.queryByRole("heading", { name: "Seguridad" })).not.toBeInTheDocument();
    });

    it("sin configuración cargada tampoco aparece: se muestra lo mínimo", () => {
      withProvider(null);
      render(<ProfileSettingsPanel onClose={onClose} />);

      expect(screen.queryByRole("heading", { name: "Seguridad" })).not.toBeInTheDocument();
    });

    it("decide por las capacidades, no por el authProvider de la sesión", () => {
      mockAuthConfig.mockReturnValue(createMockAuthConfig("local"));
      mockUseAuth.mockReturnValue({
        session: {
          token: "tok-1",
          user: { internalUserId: "u-1", username: "jperez", fullName: "Juan Perez", email: "j@example.com", notificationSoundEnabled: true, authProvider: "otra-cosa" },
        },
        completePasswordChange: vi.fn(),
      });
      render(<ProfileSettingsPanel onClose={onClose} />);

      expect(screen.getByRole("heading", { name: "Seguridad" })).toBeInTheDocument();
      expect(deriveAuthCapabilities(mockAuthConfig()).passwordChange).toBe(true);
    });
  });
});
