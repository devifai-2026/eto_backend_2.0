import { Router } from "express";
import {
  deleteRiderAccount,
  getAllRiders,
  getCurrentRide,
  getRiderById,
  getRiderRideById,
  getRiderRideHistory,
  updateRiderProfile,
} from "../controllers/riderController.js";

const router = Router();

router.route("/").get(getAllRiders);
router.route("/:id").get(getRiderById);
router.get("/currentRide/:id", getCurrentRide);
router.route("/rideDetails/:id").get(getRiderRideById);
router.route("/update/:id").patch(updateRiderProfile);
router.get("/rideHistory/:id", getRiderRideHistory);
router.delete("/delete/:id", deleteRiderAccount);

export default router;
