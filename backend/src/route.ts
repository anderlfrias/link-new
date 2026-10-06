import { Router } from "express";
import { adminAuditRouter } from "./modules/audit/audit.route";
import authRoutes from "./modules/auth/auth.route";
import conversationRoutes from "./modules/conversations/conversation.route";
import fileRoutes, { adminFileRouter } from "./modules/files/file.route";
import giphyRoutes from "./modules/giphy/giphy.route";
import messageRoutes from "./modules/messages/message.route";
import pushRoutes from "./modules/push/push.route";
import { adminSettingsRouter, publicSettingsRouter } from "./modules/settings/settings.route";
import uploadRoutes from "./modules/uploads/upload.route";
import userRoutes, { adminUserRouter } from "./modules/users/user.route";

const router = Router();

// Módulo público / con auth manejada dentro (login, EXTERNAL_AUTH o local) → se monta tal cual.
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
// Sesiones de subida chunked multipart directas a storage S3 (§4, §11).
router.use("/v1/uploads", uploadRoutes);
// Directorio de usuarios (para elegir con quién iniciar una conversación nueva).
// authenticate + attachInternalUser se aplican dentro de user.route.ts.
router.use("/v1/users", userRoutes);
// Suscripciones de Web Push (notificaciones con la app/pestaña cerrada).
router.use("/v1/push", pushRoutes);
// Buscador de GIFs/stickers (Giphy) — recurso plano, no anidado bajo una
// conversación: el resultado de una búsqueda no pertenece a ninguna en
// particular, solo el mensaje que termina usándolo (ver giphy/README.md).
router.use("/v1/giphy", giphyRoutes);
// Configuración global de la instalación — ver settings/README.md.
router.use("/v1/admin/settings", adminSettingsRouter);
router.use("/v1/admin/files", adminFileRouter);
router.use("/v1/admin/users", adminUserRouter);
router.use("/v1/admin/audit-logs", adminAuditRouter);
router.use("/v1/settings/public", publicSettingsRouter);

export default router;
