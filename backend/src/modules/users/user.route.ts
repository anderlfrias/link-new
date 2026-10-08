import { Router } from "express";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { authenticate, localAuthOnly, requireRoles } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as UserController from "./user.controller";
import { createLocalUserSchema, resetPasswordSchema } from "./user.validator";

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
// Los dos modos: con un proveedor externo solo `status` (desactivar o reactivar el
// acceso al chat, D19); con cuentas locales también nombre, email, username y roles.
adminUserRouter.patch("/:id", UserController.validateUpdateAccount, UserController.updateAccount);
// Solo con cuentas locales (404 con un proveedor externo): alta, restablecimiento y desbloqueo.
adminUserRouter.post("/", localAuthOnly(), validateBody(createLocalUserSchema), UserController.createAccount);
adminUserRouter.post(
  "/:id/password-reset",
  localAuthOnly(),
  validateBody(resetPasswordSchema),
  UserController.resetPassword,
);
adminUserRouter.post("/:id/unlock", localAuthOnly(), UserController.unlock);
