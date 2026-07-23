import { Router } from "express";
import authRoutes from "./modules/auth/auth.route";

const router = Router();

// Módulo público / con auth manejada dentro (login de EXTERNAL_AUTH) → se monta tal cual.
router.use("/v1/auth", authRoutes);

export default router;
