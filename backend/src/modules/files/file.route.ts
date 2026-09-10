import { Router } from "express";
import helmet from "helmet";
import multer from "multer";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { uploadRateLimiter } from "../../middlewares/rate-limit.middleware";
import * as FileController from "./file.controller";

// memoryStorage: el StorageProvider (src/storage) trabaja siempre con buffers,
// nunca con el disco directamente — así un futuro proveedor (S3, MinIO) no
// necesita que multer cambie de motor.
// Sin `fileFilter`: cualquier tipo de archivo se acepta salvo que un admin
// configure lo contrario (ver `file.service.ts`, `uploadFile`).
//
// El límite real y editable en runtime (`AppSettings.maxUploadSizeMb`, ver
// ../settings/README.md) se aplica en `file.service.ts`, no acá: `upload` se
// arma una sola vez al levantar el router y no puede leer la base de datos
// por request. Este `fileSize` es solo un techo de seguridad fijo, para no
// dejar que multer bufferee en memoria un body absurdamente grande antes de
// que corra cualquier código de aplicación — no lo edita un admin.
//
// 32 MB (antes 500 MB): con 500 MB, una sola subida grande alcanzaba (y
// superaba) el `max_memory_restart: "500M"` de PM2 (ver ecosystem.config.js)
// y reiniciaba el backend entero — bug activo, ver LARGE_FILES_PLAN.md B2.
// Este camino directo queda pensado para adjuntos chicos/medianos; archivos
// más grandes esperan el upload chunked de una fase posterior de ese plan —
// hasta entonces, `AppSettings.maxUploadSizeMb` puede declarar un techo
// mayor sin que este camino pueda entregarlo: multer corta acá primero.
const ABSOLUTE_MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ABSOLUTE_MAX_UPLOAD_BYTES },
});

const router = Router();

// Ruta de contenido autorizada por HMAC o Bearer (§4.5).
// Va ANTES de authenticate global porque etiquetas <img>/<audio> no envían headers.
router.get(
  "/:id/content",
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
  FileController.getContent,
);

router.use(authenticate, attachInternalUser);

router.post("/", uploadRateLimiter, upload.single("file"), FileController.upload);
router.get("/:id", FileController.getById);
router.delete("/:id", FileController.remove);

export default router;

/// Montado en `/v1/admin/files` — gestión de storage, solo rol "admin".
/// Separado del router público de arriba a propósito: expone TODOS los
/// `StoredFile` (avatares, imágenes de grupo, adjuntos) y borra físicamente,
/// algo que un usuario normal nunca puede hacer sobre archivos que no subió.
export const adminFileRouter = Router();
adminFileRouter.use(authenticate, attachInternalUser, requireRoles(ADMIN_ROLE));
adminFileRouter.get("/", FileController.listAdmin);
adminFileRouter.delete("/:id", FileController.deleteAdmin);
