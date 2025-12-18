import express from "express";
import {
  getFareSettings,
  createFareSettings,
  updateFareSettings,
  calculateFare,
  getFareHistory,
  resetFareSettings,
  deleteFareSettings,
} from "../controllers/fareSettings.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { adminOnly } from "../middlewares/role.middleware.js";

const router = express.Router();

// Public routes - no authentication required
router.post("/calculate", calculateFare);
router.get("/", getFareSettings); // This matches GET /fare-settings

// Protected routes (Admin only)
router.use(verifyJWT);
router.use(adminOnly);

// Admin-only routes
router.post("/", createFareSettings); // For initial setup
router.put("/update", updateFareSettings); // This matches PUT /fare-settings/update
router.get("/history", getFareHistory); // This matches GET /fare-settings/history
router.post("/reset", resetFareSettings); // This matches POST /fare-settings/reset
router.delete("/", deleteFareSettings); // For cleanup/testing

export default router;
