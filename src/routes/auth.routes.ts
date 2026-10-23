import { Router } from "express";
import { z } from "zod";
import { AuthController } from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { authenticateJWT } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.nativeEnum(Role).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  }),
});

router.post("/register", validate(registerSchema), AuthController.register);
router.post("/login", validate(loginSchema), AuthController.login);
router.get("/me", authenticateJWT, AuthController.me);

export default router;
