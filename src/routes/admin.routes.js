import { Router } from "express";
import {
  createAdmin,
  getAdminById,
  getAdminTotalEarnings,
  updateAdminProfile,
} from "../controllers/admin.controller.js";

const router = Router();

// Place the more specific routes before the dynamic ones
router.route("/createAdmin").post(createAdmin);
router.route("/:adminId").get(getAdminById);
router.route("/totalEarning/:adminId").get(getAdminTotalEarnings);
router.route("/update/:adminId").patch(updateAdminProfile);

export default router;
