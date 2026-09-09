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
    },
  },
}));

import { prisma } from "../../config/prisma";
import {
  aggregateFilesForAdmin,
  createStoredFile,
  findActiveById,
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
        size: 100,
        checksum: "abc",
        createdById: "u-1",
      };

      await createStoredFile(data);

      expect(prisma.storedFile.create).toHaveBeenCalledWith({
        data: { ...data, provider: FileProvider.LOCAL },
      });
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
});
