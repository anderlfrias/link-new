import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/auth/auth.repository", () => ({
  upsertExternalUser: vi.fn(),
  findProviderUsersWithoutAvatar: vi.fn(),
}));

vi.mock("../modules/auth/auth.service", () => ({
  setAvatarFromProvider: vi.fn(),
}));

vi.mock("../config/request-context", () => ({
  getLogger: vi.fn(),
}));

import { getLogger } from "../config/request-context";
import { findProviderUsersWithoutAvatar, upsertExternalUser } from "../modules/auth/auth.repository";
import { setAvatarFromProvider } from "../modules/auth/auth.service";
import { createProviderContext } from "./context";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createProviderContext", () => {
  it("upsertExternalUser guarda a la persona marcada con el id del proveedor y devuelve su id interno", async () => {
    vi.mocked(upsertExternalUser).mockResolvedValue({ id: "internal-1" } as never);
    const user = { externalId: "ext-1", email: "ana@example.com", username: "ana", fullName: "Ana" };

    const result = await createProviderContext("mi-proveedor").users.upsertExternalUser(user);

    expect(result).toEqual({ userId: "internal-1" });
    // Sin roles: sincronizar el directorio no toca los de la cuenta.
    expect(upsertExternalUser).toHaveBeenCalledWith("mi-proveedor", user);
  });

  it("listWithoutAvatar lista las personas de este proveedor, con los nombres de campo del contrato", async () => {
    vi.mocked(findProviderUsersWithoutAvatar).mockResolvedValue([
      { id: "u-1", username: "ana", externalId: "ext-1" },
      { id: "u-2", username: null, externalId: null },
    ]);

    const result = await createProviderContext("mi-proveedor").users.listWithoutAvatar();

    expect(findProviderUsersWithoutAvatar).toHaveBeenCalledWith("mi-proveedor");
    expect(result).toEqual([
      { userId: "u-1", username: "ana", externalId: "ext-1" },
      { userId: "u-2", username: null, externalId: null },
    ]);
  });

  it("setAvatarFromProvider es el del core", async () => {
    const image = { data: Buffer.from("x"), mimeType: "image/png" };

    await createProviderContext("mi-proveedor").users.setAvatarFromProvider("u-1", image);

    expect(setAvatarFromProvider).toHaveBeenCalledWith("u-1", image);
  });

  it("el logger usa el de la request en curso en el momento de loguear, no el de cuando se creó el contexto", () => {
    const first = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const second = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(getLogger).mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);
    const ctx = createProviderContext("mi-proveedor");

    ctx.logger.warn({ a: 1 }, "primero");
    ctx.logger.error({ b: 2 }, "segundo");

    expect(first.warn).toHaveBeenCalledWith({ a: 1 }, "primero");
    expect(second.error).toHaveBeenCalledWith({ b: 2 }, "segundo");
  });
});
