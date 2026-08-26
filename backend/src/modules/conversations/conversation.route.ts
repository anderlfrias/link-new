import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as ConversationController from "./conversation.controller";
import {
  addMembersSchema,
  createConversationSchema,
  markReadSchema,
  setMemberAdminSchema,
  updateConversationSchema,
  updateGroupSettingsSchema,
} from "./conversation.validator";

const router = Router();

router.use(authenticate, attachInternalUser);

router.post("/", validateBody(createConversationSchema), ConversationController.create);
router.get("/", ConversationController.list);
router.get("/:id", ConversationController.getById);
router.patch("/:id", validateBody(updateConversationSchema), ConversationController.update);
router.delete("/:id", ConversationController.remove);
router.post("/:id/members", validateBody(addMembersSchema), ConversationController.addMembers);
router.delete("/:id/members/:userId", ConversationController.removeMember);
router.patch(
  "/:id/members/:userId/admin",
  validateBody(setMemberAdminSchema),
  ConversationController.setMemberAdminStatus,
);
router.get("/:id/settings", ConversationController.getGroupSettings);
router.patch("/:id/settings", validateBody(updateGroupSettingsSchema), ConversationController.updateGroupSettings);
router.post("/:id/read", validateBody(markReadSchema), ConversationController.markRead);

export default router;
