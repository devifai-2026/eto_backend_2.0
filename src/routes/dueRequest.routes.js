import { Router } from "express";
import {
  createDueRequest,
  getDueRequestsForApprover,
  approveDueRequest,
  generateWeeklyBill,
  createFranchiseDueRequest,
  getDueRequestStatistics,
} from "../controllers/dueRequest.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();


// Driver creates due request
router.route("/driver").post(createDueRequest);

// Franchise creates due request for weekly bill payment
router.route("/franchise").post(verifyJWT, createFranchiseDueRequest);

// Get due requests based on user role
router.route("/").get(verifyJWT, getDueRequestsForApprover);

// Generate weekly bill (admin only)
router.route("/weekly-bill").post(verifyJWT, generateWeeklyBill);

// Approve due request
router.route("/:dueRequestId/approve").patch(verifyJWT, approveDueRequest);

// Get statistics
router.route("/statistics").get(verifyJWT, getDueRequestStatistics);

export default router;
