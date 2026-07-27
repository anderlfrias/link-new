import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { loginRateLimiter } from "../../middlewares/rate-limit.middleware";
import { getProfilePicture, login } from "./auth.controller";

const router = Router();

router.post("/login", loginRateLimiter, login);
// Único endpoint de este módulo que sí requiere sesión — proxya
// GET /api/v1/profile/picture de EXTERNAL_AUTH, que identifica al usuario por el
// propio token (no hace falta attachInternalUser: no toca la base local).
router.get("/profile/picture", authenticate, getProfilePicture);

export default router;
