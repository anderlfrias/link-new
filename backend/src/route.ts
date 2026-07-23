import { Router } from "express";
import authRoutes from "./modules/auth/auth.route";
import conversationRoutes from "./modules/conversations/conversation.route";

const router = Router();

// Módulo público / con auth manejada dentro (login de EXTERNAL_AUTH) → se monta tal cual.
router.use("/v1/auth", authRoutes);
// authenticate + attachInternalUser se aplican dentro de conversation.route.ts.
router.use("/v1/conversations", conversationRoutes);

export default router;
