import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminFilesPanel } from "./AdminFilesPanel";
import { useAdminFiles } from "@/features/admin/hooks/use-admin-files";
import { useDeleteAdminFile } from "@/features/admin/hooks/use-delete-admin-file";

vi.mock("@/features/admin/hooks/use-admin-files", () => ({
  useAdminFiles: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-delete-admin-file", () => ({
  useDeleteAdminFile: vi.fn(),
}));

vi.mock("@/features/files/components/FileTypeIcon", () => ({
  FileTypeIcon: () => <div data-testid="file-type-icon" />,
}));

const mockFile = {
  id: "f-1",
  originalName: "estudio.png",
  mimeType: "image/png",
  extension: "png",
  url: "http://localhost:4000/uploads/estudio.png",
  size: 51200,
  createdAt: "2026-09-09T00:00:00.000Z",
  createdBy: { id: "u-1", name: "Ana", email: "ana@test.com" },
  usage: { avatarOfUserCount: 0, groupImageOfConversationCount: 0, messageAttachmentCount: 0 },
};

function mockUseAdminFilesReturn(overrides: Partial<ReturnType<typeof useAdminFiles>> = {}) {
  return {
    files: [],
    status: "ready" as const,
    error: null,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    totalCount: 0,
    totalSize: 0,
    refetch: vi.fn(),
    removeFile: vi.fn(),
    ...overrides,
  };
}

describe("AdminFilesPanel", () => {
  const mockRemoveFile = vi.fn();
  const mockRefetch = vi.fn();
  const mockRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDeleteAdminFile).mockReturnValue({
      remove: mockRemove,
      pending: false,
      error: null,
    });
  });

  it("renders files and allows deleting a file via confirmation modal", async () => {
    vi.mocked(useAdminFiles).mockReturnValue(
      mockUseAdminFilesReturn({
        files: [mockFile],
        totalCount: 1,
        totalSize: 51200,
        refetch: mockRefetch,
        removeFile: mockRemoveFile,
      }) as any,
    );

    mockRemove.mockResolvedValueOnce(true);

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    expect(screen.getByText("estudio.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar estudio.png" }));
    expect(screen.getByText("Eliminar archivo permanentemente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));

    expect(mockRemove).toHaveBeenCalledWith("f-1");
    expect(mockRemoveFile).toHaveBeenCalledWith("f-1");
  });

  it("cancelar en el modal de confirmación no borra el archivo ni cierra la lista", async () => {
    vi.mocked(useAdminFiles).mockReturnValue(mockUseAdminFilesReturn({ files: [mockFile], totalCount: 1 }) as any);

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    await user.click(screen.getByRole("button", { name: "Eliminar estudio.png" }));
    expect(screen.getByText("Eliminar archivo permanentemente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.queryByText("Eliminar archivo permanentemente")).not.toBeInTheDocument();
    expect(screen.getByText("estudio.png")).toBeInTheDocument();
  });

  it("si remove() resuelve false (falló el borrado), el modal queda abierto y no se quita el archivo de la lista", async () => {
    vi.mocked(useAdminFiles).mockReturnValue(
      mockUseAdminFilesReturn({ files: [mockFile], totalCount: 1, removeFile: mockRemoveFile }) as any,
    );
    mockRemove.mockResolvedValueOnce(false);

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    await user.click(screen.getByRole("button", { name: "Eliminar estudio.png" }));
    await user.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));

    expect(mockRemove).toHaveBeenCalledWith("f-1");
    expect(mockRemoveFile).not.toHaveBeenCalled();
    expect(screen.getByText("Eliminar archivo permanentemente")).toBeInTheDocument();
  });

  it("muestra el spinner de carga mientras status es loading y todavía no hay archivos", () => {
    vi.mocked(useAdminFiles).mockReturnValue(mockUseAdminFilesReturn({ status: "loading", files: [] }) as any);

    render(<AdminFilesPanel />);

    expect(screen.queryByText(/archivo\(s\)/)).not.toBeInTheDocument();
    expect(screen.queryByText("No se encontraron archivos con estos filtros.")).not.toBeInTheDocument();
  });

  it("muestra el mensaje de error y permite reintentar", async () => {
    vi.mocked(useAdminFiles).mockReturnValue(
      mockUseAdminFilesReturn({ status: "error", error: "No se pudieron cargar los archivos", refetch: mockRefetch }) as any,
    );

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    expect(screen.getByText("No se pudieron cargar los archivos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("muestra el mensaje de vacío cuando status es ready y no hay archivos", () => {
    vi.mocked(useAdminFiles).mockReturnValue(mockUseAdminFilesReturn({ status: "ready", files: [] }) as any);

    render(<AdminFilesPanel />);

    expect(screen.getByText("No se encontraron archivos con estos filtros.")).toBeInTheDocument();
  });

  it("el botón 'Cargar más' llama a loadMore y se deshabilita mientras loadingMore es true", async () => {
    const mockLoadMore = vi.fn();
    vi.mocked(useAdminFiles).mockReturnValue(
      mockUseAdminFilesReturn({ files: [mockFile], hasMore: true, loadMore: mockLoadMore }) as any,
    );

    const user = userEvent.setup();
    const { rerender } = render(<AdminFilesPanel />);

    const loadMoreBtn = screen.getByRole("button", { name: /Cargar más/ });
    await user.click(loadMoreBtn);
    expect(mockLoadMore).toHaveBeenCalled();

    vi.mocked(useAdminFiles).mockReturnValue(
      mockUseAdminFilesReturn({ files: [mockFile], hasMore: true, loadMore: mockLoadMore, loadingMore: true }) as any,
    );
    rerender(<AdminFilesPanel />);

    expect(screen.getByRole("button", { name: /Cargar más/ })).toBeDisabled();
  });

  it("no muestra 'Cargar más' cuando hasMore es false", () => {
    vi.mocked(useAdminFiles).mockReturnValue(mockUseAdminFilesReturn({ files: [mockFile], hasMore: false }) as any);

    render(<AdminFilesPanel />);

    expect(screen.queryByRole("button", { name: /Cargar más/ })).not.toBeInTheDocument();
  });

  it("aplicar filtros llama a useAdminFiles con los filtros derivados del formulario (trim, tipo, fechas ISO)", async () => {
    vi.mocked(useAdminFiles).mockReturnValue(mockUseAdminFilesReturn() as any);

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    await user.selectOptions(screen.getByDisplayValue("Todos los tipos"), "image");
    await user.type(screen.getByPlaceholderText("Nombre de archivo"), "  foto  ");
    await user.type(screen.getByPlaceholderText("Usuario (nombre o email)"), "  ana@test.com  ");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    const lastCallArgs = vi.mocked(useAdminFiles).mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toEqual(
      expect.objectContaining({
        type: "image",
        search: "foto",
        uploader: "ana@test.com",
      }),
    );
  });

  it("'Limpiar' resetea el formulario y vuelve a pedir sin filtros", async () => {
    vi.mocked(useAdminFiles).mockReturnValue(mockUseAdminFilesReturn() as any);

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    await user.type(screen.getByPlaceholderText("Nombre de archivo"), "foto");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    await user.click(screen.getByRole("button", { name: "Limpiar" }));

    expect(screen.getByPlaceholderText("Nombre de archivo")).toHaveValue("");
    const lastCallArgs = vi.mocked(useAdminFiles).mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toEqual({});
  });
});
