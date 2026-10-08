import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeProvider, useExternalProvider, useLocalAuth } from "../../test/auth-mode";
import * as UserRepository from "./user.repository";
import { listUsers, listUsersForAdmin } from "./user.service";

// Las lecturas de usuarios no tienen que llamar nunca al proveedor externo: se espía el proveedor
// activo para comprobarlo (el servicio ni siquiera lo importa).
const provider = createFakeProvider({ authenticate: vi.fn(), onLogin: vi.fn() });
useExternalProvider(provider);

vi.mock("./user.repository", () => ({
  search: vi.fn(),
  findAllForAdmin: vi.fn(),
  countAllForAdmin: vi.fn(),
  sumStorageForUsers: vi.fn(),
  countGroupAdminForUsers: vi.fn(),
}));

describe("user.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listUsers", () => {
    it("delega la búsqueda en el repositorio y no consulta a ningún proveedor externo", async () => {
      const mockUsers = [{ id: "u-2", name: "Maria" }];
      vi.mocked(UserRepository.search).mockResolvedValue(mockUsers as any);

      const result = await listUsers("u-1", "maria");

      expect(UserRepository.search).toHaveBeenCalledWith("u-1", "maria");
      expect(result).toBe(mockUsers);
      expect(provider.authenticate).not.toHaveBeenCalled();
      expect(provider.onLogin).not.toHaveBeenCalled();
    });

    it("sin término de búsqueda pasa undefined al repositorio", async () => {
      vi.mocked(UserRepository.search).mockResolvedValue([] as any);

      await listUsers("u-1");

      expect(UserRepository.search).toHaveBeenCalledWith("u-1", undefined);
    });
  });

  describe("listUsersForAdmin", () => {
    it("clamps limit between 1 and 100, defaulting to 30", async () => {
      vi.mocked(UserRepository.findAllForAdmin).mockResolvedValue([]);
      vi.mocked(UserRepository.countAllForAdmin).mockResolvedValue(0);
      vi.mocked(UserRepository.sumStorageForUsers).mockResolvedValue([]);
      vi.mocked(UserRepository.countGroupAdminForUsers).mockResolvedValue([]);

      // Test default limit (30)
      await listUsersForAdmin({}, {});
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({}, { beforeId: undefined, limit: 30 });

      // Test limit clamped to min 1
      await listUsersForAdmin({}, { limit: -5 });
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({}, { beforeId: undefined, limit: 1 });

      // Test limit clamped to max 100
      await listUsersForAdmin({}, { limit: 500 });
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({}, { beforeId: undefined, limit: 100 });
    });

    it("aggregates storage and group administration stats correctly for each user", async () => {
      const mockRows = [
        {
          id: "u-1",
          name: "Alice",
          email: "alice@example.com",
          username: "alice",
          status: "ACTIVE",
          _count: {
            conversationMemberships: 5,
            sentMessages: 42,
          },
        },
        {
          id: "u-2",
          name: "Bob",
          email: "bob@example.com",
          username: "bob",
          status: "ACTIVE",
          _count: {
            conversationMemberships: 2,
            sentMessages: 0,
          },
        },
      ];

      vi.mocked(UserRepository.findAllForAdmin).mockResolvedValue(mockRows as any);
      vi.mocked(UserRepository.countAllForAdmin).mockResolvedValue(2);

      // u-1 has storage, u-2 has none. _sum.size es bigint en Prisma
      // (StoredFile.size, ver schema.prisma) — un mock number acá no
      // detectaría si listUsersForAdmin se olvida de convertir con Number().
      vi.mocked(UserRepository.sumStorageForUsers).mockResolvedValue([
        { createdById: "u-1", _count: 4, _sum: { size: 1048576n } },
      ] as any);

      // u-1 is admin in 1 group, u-2 in 0 groups
      vi.mocked(UserRepository.countGroupAdminForUsers).mockResolvedValue([
        { userId: "u-1", _count: 1 },
      ] as any);

      const result = await listUsersForAdmin({ search: "test" }, { limit: 10 });

      expect(provider.authenticate).not.toHaveBeenCalled();
      expect(provider.onLogin).not.toHaveBeenCalled();
      expect(UserRepository.findAllForAdmin).toHaveBeenCalledWith({ search: "test" }, { beforeId: undefined, limit: 10 });
      expect(UserRepository.countAllForAdmin).toHaveBeenCalledWith({ search: "test" });
      expect(UserRepository.sumStorageForUsers).toHaveBeenCalledWith(["u-1", "u-2"]);
      expect(UserRepository.countGroupAdminForUsers).toHaveBeenCalledWith(["u-1", "u-2"]);

      expect(result.totalCount).toBe(2);
      expect(result.users).toEqual([
        {
          id: "u-1",
          name: "Alice",
          email: "alice@example.com",
          username: "alice",
          status: "ACTIVE",
          storage: {
            fileCount: 4,
            totalSize: 1048576,
          },
          activity: {
            conversationCount: 5,
            messagesSentCount: 42,
            groupsAdministeredCount: 1,
          },
        },
        {
          id: "u-2",
          name: "Bob",
          email: "bob@example.com",
          username: "bob",
          status: "ACTIVE",
          storage: {
            fileCount: 0,
            totalSize: 0,
          },
          activity: {
            conversationCount: 2,
            messagesSentCount: 0,
            groupsAdministeredCount: 0,
          },
        },
      ]);
    });
  });

  describe("con cuentas locales (LOCAL_AUTH_PLAN.md §7)", () => {
    useLocalAuth();

    function stubOneRow(row: Record<string, unknown>) {
      vi.mocked(UserRepository.findAllForAdmin).mockResolvedValue([
        { id: "u-1", name: "Ana", email: "ana@example.com", username: "ana", status: "ACTIVE", _count: { conversationMemberships: 0, sentMessages: 0 }, ...row },
      ] as any);
      vi.mocked(UserRepository.countAllForAdmin).mockResolvedValue(1);
      vi.mocked(UserRepository.sumStorageForUsers).mockResolvedValue([]);
      vi.mocked(UserRepository.countGroupAdminForUsers).mockResolvedValue([]);
    }

    it("cada fila suma los roles, si tiene contraseña, el cambio obligatorio y el bloqueo; nunca la credencial", async () => {
      stubOneRow({
        roles: ["admin"],
        localCredential: { mustChangePassword: true, lockedUntil: new Date(Date.now() + 60_000), passwordHash: "hash-secreto" },
      });

      const { users } = await listUsersForAdmin({}, {});

      expect(users[0]).toMatchObject({ localRoles: ["admin"], hasPassword: true, mustChangePassword: true, locked: true });
      expect(JSON.stringify(users)).not.toContain("hash-secreto");
      expect(users[0]).not.toHaveProperty("roles");
      expect(users[0]).not.toHaveProperty("localCredential");
    });

    it("una cuenta sin credencial figura sin contraseña, y un bloqueo vencido ya no cuenta", async () => {
      stubOneRow({ roles: [], localCredential: null });
      expect((await listUsersForAdmin({}, {})).users[0]).toMatchObject({ hasPassword: false, mustChangePassword: false, locked: false });

      stubOneRow({ roles: [], localCredential: { mustChangePassword: false, lockedUntil: new Date(Date.now() - 60_000) } });
      expect((await listUsersForAdmin({}, {})).users[0]).toMatchObject({ hasPassword: true, locked: false });
    });
  });

  describe("con un proveedor externo", () => {
    it("no expone los roles ni nada de contraseñas: los administra el proveedor", async () => {
      vi.mocked(UserRepository.findAllForAdmin).mockResolvedValue([
        { id: "u-1", name: "Ana", email: "ana@example.com", username: "ana", status: "ACTIVE", roles: ["admin"], localCredential: null, _count: { conversationMemberships: 0, sentMessages: 0 } },
      ] as any);
      vi.mocked(UserRepository.countAllForAdmin).mockResolvedValue(1);
      vi.mocked(UserRepository.sumStorageForUsers).mockResolvedValue([]);
      vi.mocked(UserRepository.countGroupAdminForUsers).mockResolvedValue([]);

      const { users } = await listUsersForAdmin({}, {});

      for (const field of ["localRoles", "roles", "hasPassword", "mustChangePassword", "locked", "localCredential"]) {
        expect(users[0]).not.toHaveProperty(field);
      }
    });
  });
});
