import { Router } from "express";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as SettingsController from "./settings.controller";
import { updateSettingsSchema } from "./settings.validator";

/// Montado en `/v1/admin/settings` — lectura/escritura completa, solo "admin".
export const adminSettingsRouter = Router();
adminSettingsRouter.use(authenticate, attachInternalUser, requireRoles(ADMIN_ROLE));
adminSettingsRouter.get("/", SettingsController.getSettings);
adminSettingsRouter.patch("/", validateBody(updateSettingsSchema), SettingsController.updateSettings);

/// Montado en `/v1/settings/public` — subconjunto de solo lectura para
/// cualquier usuario autenticado (ver `PublicAppSettingsDTO`).
export const publicSettingsRouter = Router();
publicSettingsRouter.use(authenticate, attachInternalUser);
publicSettingsRouter.get("/", SettingsController.getPublicSettings);
