import { Router } from "express";
import { loginRateLimiter } from "../../middlewares/rate-limit.middleware";
import { login } from "./auth.controller";

const router = Router();

router.post("/login", loginRateLimiter, login);

export default router;
