import { Router } from "express";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import * as UserController from "./user.controller";

const router = Router();

router.use(authenticate, attachInternalUser);

router.get("/", UserController.list);

export default router;

/// Montado en `/v1/admin/users` — gestión de usuarios, solo rol "admin".
/// Separado del router público de arriba: a diferencia del directorio de
/// contactos, muestra a TODOS los usuarios (incluido el propio admin, sin
/// filtrar `status`) más su almacenamiento y actividad.
export const adminUserRouter = Router();
adminUserRouter.use(authenticate, attachInternalUser, requireRoles(ADMIN_ROLE));
adminUserRouter.get("/", UserController.listAdmin);
