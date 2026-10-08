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
  checksum?: string | null;
  createdById: string;
  provider?: FileProvider;
}) {
  return prisma.storedFile.create({
    data: {
      ...data,
      checksum: data.checksum ?? null,
      provider: data.provider ?? FileProvider.LOCAL,
    },
  });
}

export function findActiveById(id: string) {
  return prisma.storedFile.findFirst({ where: { id, deletedAt: null } });
}

/// Evalúa en una sola consulta si el usuario tiene acceso a este archivo según §5.4:
/// 1. Creador/uploader
/// 2. Avatar de cualquier usuario (visibles en toda la instalación)
/// 3. Imagen de un grupo vigente donde el usuario es miembro
/// 4. Adjunto en un mensaje vigente (no borrado) de una conversación vigente
///    donde el usuario es miembro
///
/// Los mensajes borrados y los grupos eliminados no conceden acceso: el creador
/// del archivo lo conserva por la regla 1, y un reenvío tiene su propia fila
/// `MessageFile`, así que sigue accesible mientras el reenvío exista.
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
              deletedAt: null,
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
                deletedAt: null,
                conversation: {
                  deletedAt: null,
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

/// Cuántos de `fileIds` puede adjuntar `userId` a un mensaje: los que subió, o
/// los que ya ve como adjunto de un mensaje vigente en una conversación vigente
/// de la que es miembro (sticker favorito, volver a compartir un adjunto).
/// Nunca avatares ni imágenes de grupo: poder verlos no habilita a
/// re-compartirlos. Como el acceso a un archivo se deriva de dónde está
/// adjunto (`checkUserFileAccess`), validar solo que el id exista dejaba
/// adjuntar —y así leer— el archivo de cualquier otra persona.
export function countFilesAttachableBy(userId: string, fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return Promise.resolve(0);
  return prisma.storedFile.count({
    where: {
      id: { in: fileIds },
      deletedAt: null,
      OR: [
        { createdById: userId },
        {
          messageFiles: {
            some: {
              message: {
                deletedAt: null,
                conversation: { deletedAt: null, members: { some: { userId } } },
              },
            },
          },
        },
      ],
    },
  });
}

/// Un archivo vigente subido por `userId`. Lo usan los flujos que referencian
/// un archivo por id y exigen que sea del propio actor (imagen de grupo).
export function findOwnedActiveFile(userId: string, fileId: string) {
  return prisma.storedFile.findFirst({
    where: { id: fileId, createdById: userId, deletedAt: null },
    select: { id: true, mimeType: true },
  });
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

/// Obtiene un lote de archivos almacenados localmente para migración progresiva a S3 (§7.4).
/// Ordena por tamaño ascendente (más chicos primero).
export function findBatchForMigration(limit: number) {
  return prisma.storedFile.findMany({
    where: {
      provider: FileProvider.LOCAL,
      deletedAt: null,
    },
    orderBy: {
      size: "asc",
    },
    take: limit,
  });
}

/// Actualiza el proveedor de almacenamiento de un archivo tras su verificación exitosa en S3 (§7.4).
export function updateFileProvider(id: string, provider: FileProvider, path?: string) {
  return prisma.storedFile.update({
    where: { id },
    data: {
      provider,
      ...(path ? { path } : {}),
    },
  });
}

/// Cuenta los archivos activos por proveedor (LOCAL vs S3) para estadísticas de administración (§7.4).
export async function countFilesByProvider(): Promise<{ local: number; s3: number; total: number }> {
  const [local, s3] = await Promise.all([
    prisma.storedFile.count({ where: { provider: FileProvider.LOCAL, deletedAt: null } }),
    prisma.storedFile.count({ where: { provider: FileProvider.S3, deletedAt: null } }),
  ]);
  return { local, s3, total: local + s3 };
}

