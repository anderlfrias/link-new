import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("../../config/request-context", () => ({
  getLogger: () => ({ warn }),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    localCredential: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../config/prisma";
import {
  findAvatarFileId,
  findLoginCandidates,
  findProviderUsersWithoutAvatar,
  registerFailedLogin,
  resetFailedLogins,
  savePasswordChange,
  setLocalAvatar,
  setLocalName,
  setNotificationSoundEnabled,
  updateAvatarFileId,
  updateUserPreferences,
  upsertExternalUser,
} from "./auth.repository";

describe("auth.repository", () => {
  beforeEach(() => {
    // resetAllMocks: un mockResolvedValue de un test no se arrastra al siguiente.
    vi.resetAllMocks();
  });

  describe("upsertExternalUser — cómo se reconoce a la persona (AUTH_PROVIDERS_PLAN §4.7)", () => {
    const P = "mi-proveedor";
    const person = { externalId: "ext-1", email: "Ana@Example.com", username: "ana", fullName: "Ana del Proveedor" };

    /// Cada consulta que hace `upsertExternalUser` se distingue por su `where`: así los
    /// tests no dependen del orden en que se hacen.
    function stubLookups(found: {
      byExternalId?: unknown;
      byEmail?: unknown;
      byEmailInsensitive?: unknown;
      emailHolder?: unknown;
      usernameHolder?: unknown;
    }) {
      vi.mocked(prisma.user.findUnique).mockImplementation(((args: any) =>
        Promise.resolve("externalId" in args.where ? (found.byExternalId ?? null) : (found.byEmail ?? null))) as any);
      vi.mocked(prisma.user.findFirst).mockImplementation(((args: any) => {
        if (args.where.username) return Promise.resolve(found.usernameHolder ?? null);
        if (args.where.id) return Promise.resolve(found.emailHolder ?? null);
        return Promise.resolve(found.byEmailInsensitive ?? null);
      }) as any);
      vi.mocked(prisma.user.update).mockImplementation(((args: any) => Promise.resolve({ id: args.where.id })) as any);
      vi.mocked(prisma.user.create).mockResolvedValue({ id: "nueva-1" } as any);
      vi.mocked(prisma.$transaction).mockImplementation(((ops: Promise<unknown>[]) => Promise.all(ops)) as any);
    }

    const stored = (overrides: Record<string, unknown> = {}) => ({
      id: "u-1",
      email: "ana@example.com",
      externalId: "ext-1",
      identityProvider: P,
      syncProfileWithIntegration: true,
      ...overrides,
    });

    it("sin ninguna coincidencia crea la cuenta, marcada con el proveedor", async () => {
      stubLookups({});

      const user = await upsertExternalUser(P, person);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { externalId: "ext-1" } });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "Ana@Example.com" } });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: "Ana@Example.com", mode: "insensitive" } } });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "Ana@Example.com",
          name: "Ana del Proveedor",
          username: "ana",
          externalId: "ext-1",
          identityProvider: P,
        },
      });
      expect(user.id).toBe("nueva-1");
    });

    it("con roles (los del proveedor en el login) los guarda al crear la cuenta", async () => {
      stubLookups({});

      await upsertExternalUser(P, person, { roles: ["admin"] });

      expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roles: ["admin"] }) });
    });

    it("la reconoce por externalId, sin mirar el correo, y le adopta el correo nuevo", async () => {
      stubLookups({ byExternalId: stored({ email: "ana.vieja@example.com" }) });

      const user = await upsertExternalUser(P, person);

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: expect.objectContaining({ email: "Ana@Example.com", username: "ana" }),
      });
      expect(user.id).toBe("u-1");
    });

    it("si el correo nuevo ya lo tiene otra cuenta, conserva el guardado y lo avisa con UUIDs, sin el correo", async () => {
      stubLookups({ byExternalId: stored({ email: "ana.vieja@example.com" }), emailHolder: { id: "otra-9" } });

      await upsertExternalUser(P, person);

      expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).not.toHaveProperty("email");
      expect(warn).toHaveBeenCalledWith({ userId: "u-1", heldByUserId: "otra-9" }, expect.any(String));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/example\.com/);
    });

    it("el mismo externalId bajo otro proveedor no es esta persona: sigue buscando por correo", async () => {
      stubLookups({ byExternalId: stored({ identityProvider: "otro-proveedor" }) });

      await upsertExternalUser(P, person);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "Ana@Example.com" } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("sin externalId guardado la reconoce por correo exacto y completa el proveedor y el externalId (cuenta local que migra)", async () => {
      stubLookups({ byEmail: stored({ email: "Ana@Example.com", externalId: null, identityProvider: null }) });

      const user = await upsertExternalUser(P, person);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: expect.objectContaining({ externalId: "ext-1", identityProvider: P }),
      });
      // Conserva su User.id, y con él su historial.
      expect(user.id).toBe("u-1");
    });

    it("la reconoce por correo sin distinguir mayúsculas, y el correo guardado pasa a ser el del proveedor", async () => {
      stubLookups({ byEmailInsensitive: stored({ email: "ana@example.com", externalId: null, identityProvider: null }) });

      const user = await upsertExternalUser(P, person);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: expect.objectContaining({ email: "Ana@Example.com" }),
      });
      expect(user.id).toBe("u-1");
    });

    it("al reconocerla por correo no pisa un externalId ni un proveedor que ya tenía", async () => {
      stubLookups({ byEmail: stored({ email: "Ana@Example.com", externalId: "ext-viejo", identityProvider: "proveedor-viejo" }) });

      await upsertExternalUser(P, person);

      const { data } = vi.mocked(prisma.user.update).mock.calls[0][0];
      expect(data).not.toHaveProperty("externalId");
      expect(data).not.toHaveProperty("identityProvider");
    });

    it("actualiza username y name si syncProfileWithIntegration es true", async () => {
      stubLookups({ byExternalId: stored({ username: "viejo", name: "Nombre viejo" }) });

      await upsertExternalUser(P, person);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: expect.objectContaining({ username: "ana", name: "Ana del Proveedor" }),
      });
    });

    it("actualiza solo el username y preserva el name si syncProfileWithIntegration es false", async () => {
      stubLookups({ byExternalId: stored({ syncProfileWithIntegration: false, name: "Nombre elegido acá" }) });

      await upsertExternalUser(P, person);

      const { data } = vi.mocked(prisma.user.update).mock.calls[0][0];
      expect(data).toMatchObject({ username: "ana" });
      expect(data).not.toHaveProperty("name");
    });

    it("sin username en lo que informa el proveedor no toca el que ya había; null lo limpia", async () => {
      stubLookups({ byExternalId: stored({ username: "ana.vieja" }) });

      await upsertExternalUser(P, { ...person, username: undefined });
      expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).not.toHaveProperty("username");

      await upsertExternalUser(P, { ...person, username: null });
      expect(vi.mocked(prisma.user.update).mock.calls[1][0].data).toMatchObject({ username: null });
    });

    it("con roles los sobrescribe en la cuenta existente, también para dejarla sin ninguno", async () => {
      stubLookups({ byExternalId: stored({ roles: ["admin"] }) });

      await upsertExternalUser(P, person, { roles: [] });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: expect.objectContaining({ roles: [] }),
      });
    });

    it("sin roles (sincronizar el directorio) no toca los de la cuenta ni al crearla ni al actualizarla", async () => {
      stubLookups({});
      await upsertExternalUser(P, person);
      expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).not.toHaveProperty("roles");

      stubLookups({ byExternalId: stored() });
      await upsertExternalUser(P, person);
      expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).not.toHaveProperty("roles");
    });

    it("nunca toca status: una cuenta desactivada sigue desactivada aunque el proveedor la sincronice (invariante 5)", async () => {
      stubLookups({ byExternalId: stored({ status: "INACTIVE" }) });

      await upsertExternalUser(P, person);

      expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).not.toHaveProperty("status");
    });

    it("el username del proveedor gana: se le quita a la otra cuenta en la misma transacción, sin 500 (invariante 13)", async () => {
      stubLookups({ byExternalId: stored(), usernameHolder: { id: "otra-1" } });

      const user = await upsertExternalUser(P, person);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { username: { equals: "ana", mode: "insensitive" }, id: { not: "u-1" } },
        select: { id: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "otra-1" }, data: { username: null } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(user.id).toBe("u-1");
      // El aviso lleva UUIDs, nunca el correo ni el username.
      expect(warn).toHaveBeenCalledWith({ userId: "otra-1", adoptedByUserId: "u-1" }, expect.any(String));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Ana@|"ana"/);
    });

    it("una cuenta nueva también le quita el username a quien lo tenía", async () => {
      stubLookups({ usernameHolder: { id: "otra-1" } });

      const user = await upsertExternalUser(P, person);

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "otra-1" }, data: { username: null } });
      expect(user.id).toBe("nueva-1");
      expect(warn).toHaveBeenCalledWith({ userId: "otra-1" }, expect.any(String));
    });

    it("sin username no busca quién lo tenía", async () => {
      stubLookups({});

      await upsertExternalUser(P, { ...person, username: null });

      expect(prisma.user.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ username: expect.anything() }) }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("findProviderUsersWithoutAvatar", () => {
    it("pide las cuentas activas de ese proveedor, sin avatar y con el perfil sincronizado", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u-1", username: "ana", externalId: "ext-1" }] as any);

      const result = await findProviderUsersWithoutAvatar("mi-proveedor");

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { identityProvider: "mi-proveedor", avatarFileId: null, syncProfileWithIntegration: true, status: "ACTIVE" },
        select: { id: true, username: true, externalId: true },
      });
      expect(result).toEqual([{ id: "u-1", username: "ana", externalId: "ext-1" }]);
    });
  });

  describe("updateAvatarFileId", () => {
    it("actualiza el avatarFileId sin alterar syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", avatarFileId: "file-1" } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await updateAvatarFileId("u-1", "file-1");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { avatarFileId: "file-1" },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("setLocalAvatar", () => {
    it("actualiza avatarFileId y desactiva syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", avatarFileId: "file-2", syncProfileWithIntegration: false } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await setLocalAvatar("u-1", "file-2");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { avatarFileId: "file-2", syncProfileWithIntegration: false },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("setLocalName", () => {
    it("actualiza el nombre y desactiva syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", name: "Nuevo Nombre", syncProfileWithIntegration: false } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await setLocalName("u-1", "Nuevo Nombre");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { name: "Nuevo Nombre", syncProfileWithIntegration: false },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("setNotificationSoundEnabled", () => {
    it("actualiza la preferencia sin tocar syncProfileWithIntegration", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: false } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await setNotificationSoundEnabled("u-1", false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { notificationSoundEnabled: false },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("updateUserPreferences", () => {
    it("actualiza preferencias combinadas (idioma y sonido)", async () => {
      const mockUser = { id: "u-1", notificationSoundEnabled: true, language: "en" } as any;
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await updateUserPreferences("u-1", { notificationSoundEnabled: true, language: "en" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { notificationSoundEnabled: true, language: "en" },
      });
      expect(result).toBe(mockUser);
    });
  });

  describe("findAvatarFileId", () => {
    it("devuelve el avatarFileId cuando el usuario y su avatar activo existen", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        avatarFileId: "file-123",
        avatarFile: { deletedAt: null },
      } as any);

      const result = await findAvatarFileId("u-1");

      expect(result).toBe("file-123");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "u-1" },
        select: {
          avatarFileId: true,
          avatarFile: { select: { deletedAt: true } },
        },
      });
    });

    it("devuelve null si el avatarFile está marcado como eliminado", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        avatarFileId: "file-123",
        avatarFile: { deletedAt: new Date() },
      } as any);

      expect(await findAvatarFileId("u-1")).toBeNull();
    });

    it("devuelve null si el usuario no tiene avatar o no existe", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      expect(await findAvatarFileId("u-nonexistent")).toBeNull();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({ avatarFileId: null, avatarFile: null } as any);
      expect(await findAvatarFileId("u-no-avatar")).toBeNull();
    });
  });

  describe("findLoginCandidates (LOCAL_AUTH_PLAN.md, D10)", () => {
    it("con @ busca por email, sin distinguir mayúsculas, con la credencial, hasta 2 filas", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await findLoginCandidates("Ana@Example.com");

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { email: { equals: "Ana@Example.com", mode: "insensitive" } },
        include: { localCredential: true },
        take: 2,
      });
    });

    it("sin @ busca por username", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await findLoginCandidates("Ana.Perez");

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: { equals: "Ana.Perez", mode: "insensitive" } } }),
      );
    });
  });

  describe("savePasswordChange", () => {
    it("actualiza la credencial y revoca los tokens en una sola transacción", async () => {
      vi.mocked(prisma.localCredential.update).mockReturnValue("credential-op" as any);
      vi.mocked(prisma.user.update).mockReturnValue("user-op" as any);
      const cut = new Date("2026-10-06T12:00:00.000Z");

      await savePasswordChange("user-1", { passwordHash: "scrypt$nuevo", previousPasswordHashes: [], tokensValidAfter: cut });

      expect(prisma.$transaction).toHaveBeenCalledWith(["credential-op", "user-op"]);
      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          passwordHash: "scrypt$nuevo",
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        }),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { tokensValidAfter: cut } });
    });
  });

  describe("registerFailedLogin / resetFailedLogins (D17)", () => {
    const LOCK = { maxAttempts: 3, durationMinutes: 15 };

    it("incrementa el contador de forma atómica y no bloquea antes del máximo", async () => {
      vi.mocked(prisma.localCredential.update).mockResolvedValue({ failedLoginCount: 2 } as any);

      await expect(registerFailedLogin("user-1", LOCK)).resolves.toBe(false);

      expect(prisma.localCredential.update).toHaveBeenCalledTimes(1);
      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
    });

    it("al llegar al máximo bloquea por la duración configurada y reinicia el contador", async () => {
      vi.mocked(prisma.localCredential.update).mockResolvedValueOnce({ failedLoginCount: 3 } as any);
      const before = Date.now();

      await expect(registerFailedLogin("user-1", LOCK)).resolves.toBe(true);

      const lockCall = vi.mocked(prisma.localCredential.update).mock.calls[1][0] as any;
      expect(lockCall.data.failedLoginCount).toBe(0);
      expect(lockCall.data.lockedUntil.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
    });

    it("resetFailedLogins limpia el contador y el bloqueo", async () => {
      vi.mocked(prisma.localCredential.update).mockResolvedValue({} as any);

      await resetFailedLogins("user-1");

      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });
});
