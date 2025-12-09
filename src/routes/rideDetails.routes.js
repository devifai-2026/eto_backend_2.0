import { Router } from "express";
import {
  acceptRide,
  // acceptRide2,
  cancelRide,
  findAvailableDrivers,
  getAllActiveRides,
  getRideHistory,
  getTotalDriversInCurrentRides,
  getTotalEarningsOfEndedRides,
  getTotalRides,
  rejectRide,
  updatePaymentMode,
  // findAvailableDrivers2,
  verifyDropOtp,
  verifyPickUpOtp,
} from "../controllers/rideDetailsController.js"; // Ensure the correct file path

const createRouterWithSocket = (io) => {
  const router = Router();

  router.route("/findDrivers").post(findAvailableDrivers);
  router.route("/activeRides").get(getAllActiveRides);
  router.route("/totalEarnings").get(getTotalEarningsOfEndedRides);
  router.route("/all-driver/currentride").get(getTotalDriversInCurrentRides);
  router.route("/getTotalRides").get(getTotalRides);
  router.route("/rideHistory").get(getRideHistory);

  router
    .route("/acceptRide")
    .post((req, res, next) => acceptRide(io)(req, res, next));

  router
    .route("/rejectRide")
    .post((req, res, next) => rejectRide(io)(req, res, next));

  router
    .route("/verify-pickup-otp")
    .patch((req, res, next) => verifyPickUpOtp(io)(req, res, next));
  router
    .route("/verify-drop-otp")
    .patch((req, res, next) => verifyDropOtp(io)(req, res, next));
  router
    .route("/cancel-ride")
    .delete((req, res, next) => cancelRide(io)(req, res, next));

  router
    .route("/update-payment-mode")
    .patch((req, res, next) => updatePaymentMode(io)(req, res, next));

  return router;
};

export default createRouterWithSocket;
