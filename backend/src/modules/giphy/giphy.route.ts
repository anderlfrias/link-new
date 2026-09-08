import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as GiphyController from "./giphy.controller";
import { importGiphyAssetSchema } from "./giphy.validator";

const router = Router();

router.use(authenticate, attachInternalUser);

router.get("/search", GiphyController.search);
router.get("/trending", GiphyController.trending);
router.post("/import", validateBody(importGiphyAssetSchema), GiphyController.importAsset);

export default router;
