import { Router } from "express";
import multer from "multer";
import { authenticate, authenticateForPasswordChange, localAuthOnly } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import {
  loginIpRateLimiter,
  loginUserIpRateLimiter,
  loginUserRateLimiter,
  passwordChangeRateLimiter,
} from "../../middlewares/rate-limit.middleware";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { BadRequestError } from "../../utils/errors";
import {
  changePassword,
  deleteProfilePicture,
  getAuthConfig,
  getProfilePicture,
  login,
  updatePreferences,
  updateProfile,
  updateProfilePicture,
} from "./auth.controller";
import { changePasswordSchema, updatePreferencesSchema, updateProfileSchema } from "./auth.validator";

const router = Router();

// Orden: por IP, por usuario + IP (el cupo de cada persona) y por usuario desde
// cualquier IP (tope global). Ver el comentario de rate-limit.middleware.ts.
router.post("/login", loginIpRateLimiter, loginUserIpRateLimiter, loginUserRateLimiter, login);
// Público: el frontend lo necesita antes de tener sesión, o con un token
// restringido que no puede leer /settings/public (LOCAL_AUTH_PLAN.md, D14).
router.get("/config", getAuthConfig);
// Solo con cuentas locales (404 con un proveedor externo). Único lugar donde sirve un token restringido
// (`pcr`, D13): por eso `authenticateForPasswordChange` y no `authenticate`.
router.patch(
  "/password",
  localAuthOnly(),
  authenticateForPasswordChange,
  attachInternalUser,
  passwordChangeRateLimiter,
  validateBody(changePasswordSchema),
  changePassword,
);
// GET ahora sí necesita attachInternalUser: lee la foto ya cacheada en la
// base local (`getOwnProfilePictureUrl`), ya no proxea a ningún proveedor externo.
router.get("/profile/picture", authenticate, attachInternalUser, getProfilePicture);

router.patch("/profile", authenticate, attachInternalUser, validateBody(updateProfileSchema), updateProfile);

router.patch(
  "/profile/preferences",
  authenticate,
  attachInternalUser,
  validateBody(updatePreferencesSchema),
  updatePreferences,
);

// Límite propio, más chico que `MAX_UPLOAD_SIZE_MB` (adjuntos): un avatar
// no necesita más, y hay proveedores que lo guardan como data URI en un campo de texto de su
// base — no tiene sentido mandarles fotos de perfil gigantes.
const MAX_AVATAR_SIZE_MB = 5;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/") || !ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(new BadRequestError(`Image type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// PUT/DELETE sí necesitan attachInternalUser: cachean la foto como StoredFile
// propio (ver auth.service.ts) y eso requiere el id interno, no el externo.
router.put(
  "/profile/picture",
  authenticate,
  attachInternalUser,
  avatarUpload.single("file"),
  updateProfilePicture,
);
router.delete("/profile/picture", authenticate, attachInternalUser, deleteProfilePicture);

export default router;
