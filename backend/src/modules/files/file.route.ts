import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
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
const ABSOLUTE_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ABSOLUTE_MAX_UPLOAD_BYTES },
});

const router = Router();

router.use(authenticate, attachInternalUser);

router.post("/", upload.single("file"), FileController.upload);
router.get("/:id", FileController.getById);
router.delete("/:id", FileController.remove);

export default router;
