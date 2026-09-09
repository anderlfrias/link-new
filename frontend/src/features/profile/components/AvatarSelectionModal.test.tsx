import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarSelectionModal } from "./AvatarSelectionModal";

vi.mock("@/utils/dicebear-renderer", () => ({
  renderDiceBearDataUri: vi.fn().mockReturnValue("data:image/svg+xml;base64,mock"),
}));

// Los tres pickers hijos ya tienen su propia cobertura dedicada — acá se
// mockean con un botón mínimo que invoca su callback de selección, para
// testear SOLO lo que AvatarSelectionModal orquesta (tabs, wiring de
// onSelectImage, cierre, drag&drop, Escape), no su UI interna.
vi.mock("./AvatarIllustrationPicker", () => ({
  AvatarIllustrationPicker: ({ onSelectIllustration }: any) => (
    <button onClick={() => onSelectIllustration({ id: "style-1" }, "seed-1")}>Elegir ilustración (mock)</button>
  ),
}));

vi.mock("./AvatarCustomizerView", () => ({
  AvatarCustomizerView: ({ onConfirm, onBack }: any) => (
    <div>
      <button onClick={() => onConfirm(new Blob(["ilustracion"], { type: "image/png" }))}>
        Confirmar ilustración (mock)
      </button>
      <button onClick={onBack}>Volver (mock)</button>
    </div>
  ),
}));

vi.mock("./BoringAvatarPicker", () => ({
  BoringAvatarPicker: ({ onSelect }: any) => (
    <button onClick={() => onSelect(new Blob(["boring"], { type: "image/png" }))}>Elegir abstracto (mock)</button>
  ),
}));

function buildFile(name = "foto.png", type = "image/png") {
  return new File(["contenido"], name, { type });
}

describe("AvatarSelectionModal", () => {
  let onClose: ReturnType<typeof vi.fn<() => void>>;
  let onSelectImage: ReturnType<typeof vi.fn<(blob: Blob, filename?: string) => void | Promise<void>>>;

  beforeEach(() => {
    onClose = vi.fn();
    onSelectImage = vi.fn().mockResolvedValue(undefined);
  });

  it("no renderiza nada si isOpen es false", () => {
    const { container } = render(
      <AvatarSelectionModal isOpen={false} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renderiza modal cuando isOpen es true y permite alternar pestañas", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    expect(screen.getByRole("heading", { name: "Foto de perfil" })).toBeInTheDocument();

    const abstractTab = screen.getByRole("button", { name: /Abstractos/i });
    await user.click(abstractTab);
    expect(screen.getByText("Elegir abstracto (mock)")).toBeInTheDocument();

    const uploadTab = screen.getByRole("button", { name: /Subir archivo/i });
    await user.click(uploadTab);
    expect(screen.getByText(/Arrastrá tu foto acá/i)).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Cerrar modal" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("elegir una ilustración y confirmarla llama a onSelectImage con el blob y cierra el modal", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    await user.click(screen.getByText("Elegir ilustración (mock)"));
    expect(screen.getByText("Confirmar ilustración (mock)")).toBeInTheDocument();

    await user.click(screen.getByText("Confirmar ilustración (mock)"));

    await waitFor(() => expect(onSelectImage).toHaveBeenCalledWith(expect.any(Blob), "avatar-illustration.png"));
    expect(onClose).toHaveBeenCalled();
  });

  it("elegir un avatar abstracto llama a onSelectImage con el blob y cierra el modal", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    await user.click(screen.getByRole("button", { name: /Abstractos/i }));
    await user.click(screen.getByText("Elegir abstracto (mock)"));

    await waitFor(() => expect(onSelectImage).toHaveBeenCalledWith(expect.any(Blob), "avatar-boring.png"));
    expect(onClose).toHaveBeenCalled();
  });

  it("subir un archivo desde el input oculto llama a onSelectImage con el File y cierra el modal", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />,
    );

    await user.click(screen.getByRole("button", { name: /Subir archivo/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = buildFile("mi-foto.jpg", "image/jpeg");

    await user.upload(input, file);

    await waitFor(() => expect(onSelectImage).toHaveBeenCalledWith(file, "mi-foto.jpg"));
    expect(onClose).toHaveBeenCalled();
  });

  it("soltar (drop) un archivo de imagen sobre la zona de carga llama a onSelectImage", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);
    await user.click(screen.getByRole("button", { name: /Subir archivo/i }));

    const dropZone = screen.getByText(/Arrastrá tu foto acá/i).parentElement as HTMLElement;
    const file = buildFile("arrastrada.png", "image/png");

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(onSelectImage).toHaveBeenCalledWith(file, "arrastrada.png"));
  });

  it("soltar un archivo que NO es imagen no llama a onSelectImage", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);
    await user.click(screen.getByRole("button", { name: /Subir archivo/i }));

    const dropZone = screen.getByText(/Arrastrá tu foto acá/i).parentElement as HTMLElement;
    const notAnImage = new File(["contenido"], "documento.pdf", { type: "application/pdf" });

    fireEvent.drop(dropZone, { dataTransfer: { files: [notAnImage] } });

    expect(onSelectImage).not.toHaveBeenCalled();
  });

  it("Escape cierra el modal cuando NO se está personalizando una ilustración", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("Escape durante la personalización de una ilustración vuelve al listado en vez de cerrar el modal", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    await user.click(screen.getByText("Elegir ilustración (mock)"));
    expect(screen.getByText("Confirmar ilustración (mock)")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirmar ilustración (mock)")).not.toBeInTheDocument();
  });

  it("click en el fondo (backdrop) cierra el modal, pero click dentro del contenido no", async () => {
    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    await user.click(screen.getByRole("heading", { name: "Foto de perfil" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("con disabled=true, el click en el fondo no cierra el modal", async () => {
    const user = userEvent.setup();
    render(
      <AvatarSelectionModal
        isOpen={true}
        onClose={onClose}
        userSeed="seed-1"
        onSelectImage={onSelectImage}
        disabled
      />,
    );

    await user.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("muestra el overlay de carga mientras onSelectImage está pendiente, y lo oculta al resolver", async () => {
    let resolveUpload!: () => void;
    onSelectImage.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<AvatarSelectionModal isOpen={true} onClose={onClose} userSeed="seed-1" onSelectImage={onSelectImage} />);

    await user.click(screen.getByRole("button", { name: /Abstractos/i }));
    await user.click(screen.getByText("Elegir abstracto (mock)"));

    expect(screen.getByText("Guardando tu nueva foto de perfil...")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    resolveUpload();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText("Guardando tu nueva foto de perfil...")).not.toBeInTheDocument();
  });
});
