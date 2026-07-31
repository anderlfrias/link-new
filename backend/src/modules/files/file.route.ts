import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import env from "../../config/env";
import * as FileController from "./file.controller";

// memoryStorage: el StorageProvider (src/storage) trabaja siempre con buffers,
// nunca con el disco directamente — así un futuro proveedor (S3, MinIO) no
// necesita que multer cambie de motor.
// Sin `fileFilter`: cualquier tipo de archivo se acepta (ver `file.service.ts`,
// `uploadFile`) — el único límite que queda es el tamaño.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

const router = Router();

router.use(authenticate, attachInternalUser);

router.post("/", upload.single("file"), FileController.upload);
router.get("/:id", FileController.getById);
router.delete("/:id", FileController.remove);

export default router;
