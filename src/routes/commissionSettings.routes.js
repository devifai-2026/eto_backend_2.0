import express from "express";
import {
  getFranchiseCommissionSettings,
  updateFranchiseCommissionSettings,
  getAllFranchisesWithCommissionSettings,
  getFranchiseCommissionHistory,
  deactivateFranchiseCommissionSettings,
  reactivateFranchiseCommissionSettings,
} from "../controllers/commissionSettings.controller.js";
import { adminOnly } from "../middlewares/role.middleware.js";

const router = express.Router();

// Apply adminOnly middleware to all routes (all commission settings routes require admin access)
// router.use(adminOnly);

// 1. Get commission settings for a specific franchise
// GET /api/commission-settings/:franchiseId
router.get("/:franchiseId", getFranchiseCommissionSettings);

// 2. Update commission settings for a specific franchise
router.put("/:franchiseId", updateFranchiseCommissionSettings);

// 3. Get all franchises with their commission settings
// GET /api/commission-settings
router.get("/", getAllFranchisesWithCommissionSettings);

// 4. Get commission settings history for a franchise
// GET /api/commission-settings/:franchiseId/history
router.get("/:franchiseId/history", getFranchiseCommissionHistory);

// 5. Deactivate commission settings for a franchise
// PUT /api/commission-settings/:franchiseId/deactivate
router.put("/:franchiseId/deactivate", deactivateFranchiseCommissionSettings);

// 6. Reactivate commission settings for a franchise
router.put("/:franchiseId/reactivate", reactivateFranchiseCommissionSettings);

export default router;
