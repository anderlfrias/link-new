import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import env from "../../config/env";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { BadRequestError } from "../../utils/errors";
import * as FileController from "./file.controller";

// memoryStorage: el StorageProvider (src/storage) trabaja siempre con buffers,
// nunca con el disco directamente — así un futuro proveedor (S3, MinIO) no
// necesita que multer cambie de motor.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(new BadRequestError(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authenticate, attachInternalUser);

router.post("/", upload.single("file"), FileController.upload);
router.get("/:id", FileController.getById);
router.delete("/:id", FileController.remove);

export default router;
