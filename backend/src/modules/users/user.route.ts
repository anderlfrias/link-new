import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import * as UserController from "./user.controller";

const router = Router();

router.use(authenticate, attachInternalUser);

router.get("/", UserController.list);

export default router;
