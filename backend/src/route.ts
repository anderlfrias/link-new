import { Router } from "express";
import authRoutes from "./modules/auth/auth.route";
import conversationRoutes from "./modules/conversations/conversation.route";
import fileRoutes from "./modules/files/file.route";
import messageRoutes from "./modules/messages/message.route";
import userRoutes from "./modules/users/user.route";

const router = Router();

// Módulo público / con auth manejada dentro (login de EXTERNAL_AUTH) → se monta tal cual.
router.use("/v1/auth", authRoutes);
// authenticate + attachInternalUser se aplican dentro de conversation.route.ts.
router.use("/v1/conversations", conversationRoutes);
// Anidado bajo su conversación: ningún mensaje existe fuera de una. Debe montarse
// después de conversationRoutes para que el fallthrough de Express (conversationRoutes
// no tiene ruta para "/:id/messages") llegue hasta acá.
router.use("/v1/conversations/:conversationId/messages", messageRoutes);
// Recurso plano: un StoredFile no pertenece a ninguna conversación en particular
// (sirve de avatar, imagen de grupo o adjunto de mensaje por igual).
router.use("/v1/files", fileRoutes);
// Directorio de usuarios (para elegir con quién iniciar una conversación nueva).
// authenticate + attachInternalUser se aplican dentro de user.route.ts.
router.use("/v1/users", userRoutes);

export default router;
