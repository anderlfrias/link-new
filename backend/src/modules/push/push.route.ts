import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as PushController from "./push.controller";
import { subscribeSchema, unsubscribeSchema } from "./push.validator";

const router = Router();

router.use(authenticate, attachInternalUser);

// Pública para cualquier usuario logueado (no es un secreto, ver RFC 8292) —
// el frontend la necesita para `pushManager.subscribe()`.
router.get("/vapid-public-key", PushController.getPublicKey);
router.post("/subscribe", validateBody(subscribeSchema), PushController.subscribe);
router.post("/unsubscribe", validateBody(unsubscribeSchema), PushController.unsubscribe);

export default router;
