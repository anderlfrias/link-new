import { Router } from "express";
import helmet from "helmet";
import multer from "multer";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { downloadRateLimiter, uploadRateLimiter } from "../../middlewares/rate-limit.middleware";
import * as FileController from "./file.controller";
import { DIRECT_UPLOAD_MAX_BYTES } from "./upload-limits";

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
// 32 MB (antes 500 MB, ver `upload-limits.ts`): con 500 MB, una sola subida
// grande alcanzaba (y superaba) el `max_memory_restart: "500M"` de PM2 (ver
// ecosystem.config.js) y reiniciaba el backend entero. Este camino directo es
// para adjuntos chicos/medianos; los archivos más grandes van por partes
// (`/v1/uploads`), que solo existe con almacenamiento S3. Sin S3, este techo es
// el máximo real, aunque `AppSettings.maxUploadSizeMb` declare uno mayor: el
// cliente recibe el límite efectivo en `GET /v1/settings/public`.

// Además del archivo, el frontend manda a lo sumo `conversationId` y `kind`
// (ver file.controller.ts#upload). Sin estos topes, multer acepta campos de
// texto sin límite de cantidad y los guarda en memoria: un solo request podía
// cargar cientos de MB de campos basura.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DIRECT_UPLOAD_MAX_BYTES, files: 1, fields: 10, fieldSize: 64 * 1024 },
});

const router = Router();

// Ruta de contenido autorizada por HMAC o Bearer (§4.5).
// Va ANTES de authenticate global porque etiquetas <img>/<audio> no envían headers.
router.get(
  "/:id/content",
  downloadRateLimiter,
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
adminFileRouter.get("/stats", FileController.getStatsAdmin);
adminFileRouter.get("/", FileController.listAdmin);
adminFileRouter.delete("/:id", FileController.deleteAdmin);
