import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettingsPanel } from "./ProfileSettingsPanel";
import { APP_VERSION } from "@/constants/app-version.constant";

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
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
});
