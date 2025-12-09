import { Router } from "express";
import {
  activateDriver,
  createDriver,
  deactivateDriver,
  getAllActiveDrivers,
  getAllDrivers,
  getCurrentRide,
  getDriverById,
  getDriverRideById,
  getRideHistory,
  updateDriverProfile,
  getRecentRides,
  getTotalEarningByDate,
  getTotalWithdrawalsByDate,
  createWithdrawalLogs,
  getTodaysRides,
  getDriverRegistrationTimeById,
  getTopDrivers,
  getUnapprovedDrivers,
  approveDriverByDriverId,
  getTodaysEarnings,
  getApprovedStatus,
  getWalletBalance,
  deleteDriverAccount,
  updateOneSignalPlayerId,
  getRejectedDrivers,
  rejectDriverByDriverId,
} from "../controllers/driver.controller.js";
import { getETOCardById } from "../controllers/etoController.js";

const router = Router();

// Place the more specific routes before the dynamic ones
router.route("/createDriver").post(createDriver);
router.route("/updatePlayerId").post(updateOneSignalPlayerId);
router.route("/createWithdrawlLogs").post(createWithdrawalLogs);
router.route("/active").get(getAllActiveDrivers);
router.route("/registered-time/:id").get(getDriverRegistrationTimeById);
router.route("/eto-card/:id").get(getETOCardById);
router.route("/activate/:id").put(activateDriver);
router.route("/deactivate/:id").put(deactivateDriver);
router.route("/approve").patch(approveDriverByDriverId);
router.route("/reject").patch(rejectDriverByDriverId);
router.route("/checkApprove/:userId").get(getApprovedStatus);
router.route("/").get(getAllDrivers);
router.route("/rideDetails/:id").get(getDriverRideById);
router.route("/topDrivers").get(getTopDrivers);
router.route("/newRegistered").get(getUnapprovedDrivers);
router.route("/rejected").get(getRejectedDrivers);
router.route("/update/:id").patch(updateDriverProfile);
router.route("/currentRide/:id").get(getCurrentRide);
router.route("/todaysRides/:driverId").get(getTodaysRides);
router.route("/rideHistory/:id").get(getRideHistory);
router.route("/getTotalWithdrawalsByDate").post(getTotalWithdrawalsByDate);

// The dynamic ID route should be last to avoid conflicts
router.route("/getRecentRides/:id").get(getRecentRides);
router.route("/getTotalEarningByDate/:userId").post(getTotalEarningByDate);
router.route("/getTodaysEarnings/:userId").get(getTodaysEarnings);
router.route("/getWalletBalance/:userId").get(getWalletBalance);
router.route("/:id").get(getDriverById);
router.delete("/deleteAccount/:driverId", deleteDriverAccount);

export default router;
