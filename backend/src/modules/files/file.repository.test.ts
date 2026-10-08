import { FileProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    storedFile: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "../../config/prisma";
import {
  aggregateFilesForAdmin,
  checkUserFileAccess,
  countFilesAttachableBy,
  createStoredFile,
  findActiveById,
  findOwnedActiveFile,
  isAvatarFile,
  listFilesForAdmin,
  softDelete,
} from "./file.repository";

describe("file.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createStoredFile", () => {
    it("crea el archivo asignando FileProvider.LOCAL", async () => {
      vi.mocked(prisma.storedFile.create).mockResolvedValue({ id: "f-1" } as any);

      const data = {
        originalName: "test.png",
        storedName: "uuid.png",
        path: "chat/123/uuid.png",
        mimeType: "image/png",
        extension: "png",
        size: 100n,
        checksum: "abc",
        createdById: "u-1",
      };

      await createStoredFile(data);

      expect(prisma.storedFile.create).toHaveBeenCalledWith({
        data: { ...data, provider: FileProvider.LOCAL },
      });
    });

    it("acepta un size mayor a 2^31 bytes (2 GiB+) sin desbordar", async () => {
      vi.mocked(prisma.storedFile.create).mockResolvedValue({ id: "f-large" } as any);

      // 3 GiB en bytes: desborda un int4 (max ~2.147 GB) pero no un bigint.
      const threeGib = 3n * 1024n ** 3n;
      const data = {
        originalName: "video.mp4",
        storedName: "uuid.mp4",
        path: "chat/123/uuid.mp4",
        mimeType: "video/mp4",
        extension: "mp4",
        size: threeGib,
        checksum: "def",
        createdById: "u-1",
      };

      await createStoredFile(data);

      expect(prisma.storedFile.create).toHaveBeenCalledWith({
        data: { ...data, provider: FileProvider.LOCAL },
      });
      expect(vi.mocked(prisma.storedFile.create).mock.calls[0][0].data.size).toBe(threeGib);
    });
  });

  describe("findActiveById y softDelete", () => {
    it("findActiveById filtra deletedAt null", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValue({ id: "f-1" } as any);

      await findActiveById("f-1");

      expect(prisma.storedFile.findFirst).toHaveBeenCalledWith({
        where: { id: "f-1", deletedAt: null },
      });
    });

    it("softDelete actualiza deletedAt", async () => {
      vi.mocked(prisma.storedFile.update).mockResolvedValue({ id: "f-1" } as any);

      await softDelete("f-1");

      expect(prisma.storedFile.update).toHaveBeenCalledWith({
        where: { id: "f-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe("aggregateFilesForAdmin y listFilesForAdmin (filtros dinámicos)", () => {
    it("sin filtros: busca con deletedAt: null y AND vacío", async () => {
      vi.mocked(prisma.storedFile.aggregate).mockResolvedValue({
        _count: 5,
        _sum: { size: 1000 },
      } as any);

      const result = await aggregateFilesForAdmin({});

      expect(prisma.storedFile.aggregate).toHaveBeenCalledWith({
        where: { deletedAt: null, AND: [] },
        _sum: { size: true },
        _count: true,
      });
      expect(result._count).toBe(5);
    });

    it("filtro por categoría image", async () => {
      vi.mocked(prisma.storedFile.aggregate).mockResolvedValue({ _count: 2, _sum: { size: 200 } } as any);

      await aggregateFilesForAdmin({ type: "image" });

      expect(prisma.storedFile.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            AND: [{ mimeType: { startsWith: "image/" } }],
          },
        }),
      );
    });

    it("filtro por categoría audio", async () => {
      vi.mocked(prisma.storedFile.aggregate).mockResolvedValue({ _count: 1, _sum: { size: 50 } } as any);

      await aggregateFilesForAdmin({ type: "audio" });

      expect(prisma.storedFile.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            AND: [{ mimeType: { startsWith: "audio/" } }],
          },
        }),
      );
    });

    it("filtro por categoría other (niega image y audio)", async () => {
      vi.mocked(prisma.storedFile.aggregate).mockResolvedValue({ _count: 3, _sum: { size: 500 } } as any);

      await aggregateFilesForAdmin({ type: "other" });

      expect(prisma.storedFile.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            AND: [
              { NOT: { mimeType: { startsWith: "image/" } } },
              { NOT: { mimeType: { startsWith: "audio/" } } },
            ],
          },
        }),
      );
    });

    it("filtro por uploader, search y rango de fechas (from y to)", async () => {
      vi.mocked(prisma.storedFile.findMany).mockResolvedValue([]);

      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      await listFilesForAdmin(
        {
          uploader: "juan",
          search: "reporte",
          from,
          to,
        },
        { limit: 10, beforeId: "file-cursor" },
      );

      expect(prisma.storedFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            AND: [
              {
                createdBy: {
                  OR: [
                    { name: { contains: "juan", mode: "insensitive" } },
                    { email: { contains: "juan", mode: "insensitive" } },
                  ],
                },
              },
              { originalName: { contains: "reporte", mode: "insensitive" } },
              {
                createdAt: {
                  gte: from,
                  lte: to,
                },
              },
            ],
          },
          take: 10,
          cursor: { id: "file-cursor" },
          skip: 1,
        }),
      );
    });
  });

  describe("checkUserFileAccess", () => {
    it("devuelve true si findFirst encuentra coincidencia según las reglas §5.4", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce({ id: "f-1" } as any);

      const hasAccess = await checkUserFileAccess("u-1", "f-1");
      expect(hasAccess).toBe(true);
      expect(prisma.storedFile.findFirst).toHaveBeenCalledWith({
        where: {
          id: "f-1",
          OR: [
            { createdById: "u-1" },
            { avatarOfUsers: { some: {} } },
            { imageOfConversations: { some: { deletedAt: null, members: { some: { userId: "u-1" } } } } },
            {
              messageFiles: {
                some: {
                  message: {
                    deletedAt: null,
                    conversation: { deletedAt: null, members: { some: { userId: "u-1" } } },
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      });
    });

    it("devuelve false si no hay coincidencia de acceso", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce(null);

      const hasAccess = await checkUserFileAccess("u-stranger", "f-secret");
      expect(hasAccess).toBe(false);
    });

    it("ignora adjuntos de mensajes borrados y de conversaciones eliminadas", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce(null);

      await checkUserFileAccess("u-1", "f-1");

      const { where } = vi.mocked(prisma.storedFile.findFirst).mock.calls[0][0] as any;
      const [, , imageOfGroup, attachment] = where.OR;
      // Imagen de un grupo eliminado: ya no concede acceso a sus miembros.
      expect(imageOfGroup.imageOfConversations.some.deletedAt).toBeNull();
      // Adjunto de un mensaje borrado "para todos", o de una conversación eliminada.
      expect(attachment.messageFiles.some.message.deletedAt).toBeNull();
      expect(attachment.messageFiles.some.message.conversation.deletedAt).toBeNull();
    });
  });

  describe("countFilesAttachableBy", () => {
    it("devuelve 0 sin consultar la base si no hay fileIds", async () => {
      const count = await countFilesAttachableBy("u-1", []);

      expect(count).toBe(0);
      expect(prisma.storedFile.count).not.toHaveBeenCalled();
    });

    it("cuenta solo archivos vigentes subidos por el usuario o adjuntos a mensajes vigentes de sus conversaciones vigentes", async () => {
      vi.mocked(prisma.storedFile.count).mockResolvedValue(2);

      const count = await countFilesAttachableBy("u-1", ["f-1", "f-2"]);

      expect(count).toBe(2);
      expect(prisma.storedFile.count).toHaveBeenCalledWith({
        where: {
          id: { in: ["f-1", "f-2"] },
          deletedAt: null,
          OR: [
            { createdById: "u-1" },
            {
              messageFiles: {
                some: {
                  message: {
                    deletedAt: null,
                    conversation: { deletedAt: null, members: { some: { userId: "u-1" } } },
                  },
                },
              },
            },
          ],
        },
      });
    });

    it("no incluye avatares ni imágenes de grupo entre los archivos adjuntables", async () => {
      vi.mocked(prisma.storedFile.count).mockResolvedValue(0);

      await countFilesAttachableBy("u-1", ["f-avatar"]);

      const { where } = vi.mocked(prisma.storedFile.count).mock.calls[0][0] as any;
      const serialized = JSON.stringify(where);
      expect(serialized).not.toContain("avatarOfUsers");
      expect(serialized).not.toContain("imageOfConversations");
    });
  });

  describe("findOwnedActiveFile", () => {
    it("filtra por dueño y por archivo no borrado", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce({ id: "f-1", mimeType: "image/png" } as any);

      const file = await findOwnedActiveFile("u-1", "f-1");

      expect(file).toEqual({ id: "f-1", mimeType: "image/png" });
      expect(prisma.storedFile.findFirst).toHaveBeenCalledWith({
        where: { id: "f-1", createdById: "u-1", deletedAt: null },
        select: { id: true, mimeType: true },
      });
    });

    it("devuelve null si el archivo no es del usuario", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce(null);

      expect(await findOwnedActiveFile("u-2", "f-1")).toBeNull();
    });
  });

  describe("isAvatarFile", () => {
    it("devuelve true si el archivo está asociado a avatarOfUsers", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce({ id: "f-avatar" } as any);

      const result = await isAvatarFile("f-avatar");
      expect(result).toBe(true);
      expect(prisma.storedFile.findFirst).toHaveBeenCalledWith({
        where: { id: "f-avatar", avatarOfUsers: { some: {} } },
        select: { id: true },
      });
    });

    it("devuelve false si no es avatar", async () => {
      vi.mocked(prisma.storedFile.findFirst).mockResolvedValueOnce(null);

      const result = await isAvatarFile("f-doc");
      expect(result).toBe(false);
    });
  });
});

