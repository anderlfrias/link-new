import {
  IconFile,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeTxt,
  IconFileTypeXls,
  IconFileTypeZip,
  IconHeadphones,
  IconVideo,
} from "@tabler/icons-react";

const ICON_BY_MIME_TYPE: Record<string, typeof IconFile> = {
  "application/pdf": IconFileTypePdf,
  "text/plain": IconFileTypeTxt,
  "application/msword": IconFileTypeDoc,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": IconFileTypeDocx,
  "application/vnd.ms-excel": IconFileTypeXls,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": IconFileTypeXls,
  "application/zip": IconFileTypeZip,
};

interface FileTypeIconProps {
  mimeType: string;
  size?: number;
  className?: string;
}

/** Ícono según el mimetype de un adjunto (imágenes se muestran como thumbnail en otro lado, no acá). */
export function FileTypeIcon({ mimeType, size = 22, className }: FileTypeIconProps) {
  const Icon =
    ICON_BY_MIME_TYPE[mimeType] ??
    (mimeType.startsWith("audio/") ? IconHeadphones : mimeType.startsWith("video/") ? IconVideo : IconFile);
  return <Icon size={size} stroke={1.5} className={className} />;
}
