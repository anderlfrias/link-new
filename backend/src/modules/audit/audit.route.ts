import { Router } from "express";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import * as AuditController from "./audit.controller";

export const adminAuditRouter = Router();
adminAuditRouter.use(authenticate, attachInternalUser, requireRoles(ADMIN_ROLE));
adminAuditRouter.get("/", AuditController.listAdmin);
