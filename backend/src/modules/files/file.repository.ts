import { FileProvider, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AdminFileFilters } from "./file.types";

export function createStoredFile(data: {
  originalName: string;
  storedName: string;
  path: string;
  mimeType: string;
  extension: string;
  /// `bigint` porque `StoredFile.size` lo es en Prisma (ver schema.prisma) —
  /// el caller convierte desde el `number` que devuelve `storage.save()`.
  size: bigint;
  checksum: string;
  createdById: string;
  provider?: FileProvider;
}) {
  return prisma.storedFile.create({
    data: { ...data, provider: data.provider ?? FileProvider.LOCAL },
  });
}

export function findActiveById(id: string) {
  return prisma.storedFile.findFirst({ where: { id, deletedAt: null } });
}

/// Evalúa en una sola consulta si el usuario tiene acceso a este archivo según §5.4:
/// 1. Creador/uploader
/// 2. Avatar de cualquier usuario (visibles en toda la instalación)
/// 3. Imagen de grupo de una conversación donde el usuario es miembro
/// 4. Adjunto en un mensaje de una conversación donde el usuario es miembro
export async function checkUserFileAccess(userId: string, fileId: string): Promise<boolean> {
  const match = await prisma.storedFile.findFirst({
    where: {
      id: fileId,
      OR: [
        { createdById: userId },
        { avatarOfUsers: { some: {} } },
        {
          imageOfConversations: {
            some: {
              members: {
                some: { userId },
              },
            },
          },
        },
        {
          messageFiles: {
            some: {
              message: {
                conversation: {
                  members: {
                    some: { userId },
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  return match !== null;
}

/// Verifica si el archivo es un avatar de usuario (público a toda la app).
export async function isAvatarFile(fileId: string): Promise<boolean> {
  const match = await prisma.storedFile.findFirst({
    where: {
      id: fileId,
      avatarOfUsers: { some: {} },
    },
    select: { id: true },
  });
  return match !== null;
}

/// Borrado lógico únicamente — igual que `Conversation`/`Message` en el resto
/// del sistema. No borra el archivo físico: la limpieza de archivos huérfanos
/// en disco es un job de background (`src/workers`) que todavía no existe.
export function softDelete(id: string) {
  return prisma.storedFile.update({ where: { id }, data: { deletedAt: new Date() } });
}

/// Único punto que arma el `where` del listado admin — compartido por
/// `listFilesForAdmin`/`aggregateFilesForAdmin` para que ambas siempre
/// respondan sobre exactamente el mismo conjunto de archivos.
function buildAdminFileWhere(filters: AdminFileFilters): Prisma.StoredFileWhereInput {
  const and: Prisma.StoredFileWhereInput[] = [];

  if (filters.type === "image") {
    and.push({ mimeType: { startsWith: "image/" } });
  } else if (filters.type === "audio") {
    and.push({ mimeType: { startsWith: "audio/" } });
  } else if (filters.type === "other") {
    and.push({ NOT: { mimeType: { startsWith: "image/" } } });
    and.push({ NOT: { mimeType: { startsWith: "audio/" } } });
  }

  if (filters.uploader) {
    and.push({
      createdBy: {
        OR: [
          { name: { contains: filters.uploader, mode: "insensitive" } },
          { email: { contains: filters.uploader, mode: "insensitive" } },
        ],
      },
    });
  }

  if (filters.search) {
    and.push({ originalName: { contains: filters.search, mode: "insensitive" } });
  }

  if (filters.from || filters.to) {
    and.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  return { deletedAt: null, AND: and };
}

const adminListInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  _count: { select: { avatarOfUsers: true, imageOfConversations: true, messageFiles: true } },
} satisfies Prisma.StoredFileInclude;

export function listFilesForAdmin(filters: AdminFileFilters, options: { beforeId?: string; limit: number }) {
  return prisma.storedFile.findMany({
    where: buildAdminFileWhere(filters),
    include: adminListInclude,
    orderBy: { createdAt: "desc" },
    take: options.limit,
    ...(options.beforeId ? { cursor: { id: options.beforeId }, skip: 1 } : {}),
  });
}

export function aggregateFilesForAdmin(filters: AdminFileFilters) {
  return prisma.storedFile.aggregate({
    where: buildAdminFileWhere(filters),
    _sum: { size: true },
    _count: true,
  });
}
