import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { partUrlsRateLimiter, uploadRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as UploadController from "./upload.controller";
import {
  completeUploadSchema,
  getPartUrlsSchema,
  initiateUploadSchema,
} from "./upload.validator";

const router = Router();

router.use(authenticate, attachInternalUser);

router.post("/", uploadRateLimiter, validateBody(initiateUploadSchema), UploadController.initiate);
router.get("/:id", UploadController.getStatus);
router.post(
  "/:id/part-urls",
  partUrlsRateLimiter,
  validateBody(getPartUrlsSchema),
  UploadController.getPartUrls,
);
router.post("/:id/complete", validateBody(completeUploadSchema), UploadController.complete);
router.delete("/:id", UploadController.abort);

export default router;
