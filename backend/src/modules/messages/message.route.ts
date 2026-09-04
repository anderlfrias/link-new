import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as MessageController from "./message.controller";
import { createMessageSchema, forwardMessageSchema, updateMessageSchema } from "./message.validator";

// mergeParams: este router se monta bajo /v1/conversations/:conversationId/messages
// (ver route.ts) — sin mergeParams, req.params.conversationId no llegaría aquí.
const router = Router({ mergeParams: true });

router.use(authenticate, attachInternalUser);

router.post("/", validateBody(createMessageSchema), MessageController.create);
// Antes de "/:id" (PATCH/DELETE) a propósito — mismo criterio que POST /self
// en conversations: es una ruta fija, no colisiona con esas (ni con GET /files).
router.post("/forward", validateBody(forwardMessageSchema), MessageController.forward);
router.get("/", MessageController.list);
router.get("/files", MessageController.listFiles);
router.patch("/:id", validateBody(updateMessageSchema), MessageController.update);
router.delete("/:id", MessageController.remove);

export default router;
