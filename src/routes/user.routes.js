import { Router } from "express";
import {
  logoutUser,
  refreshAccessToken,
  loginAndSendOtp,
  verifyOtp,
  resendOtp,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
const router = Router();

// router.route("/login").post(loginUser);
router.route("/login").post(loginAndSendOtp);
router.route("/resend_otp").post(resendOtp);
router.route("/verifyotp").post(verifyOtp);

// secure routes
// router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh_token").post(verifyJWT, refreshAccessToken);

export default router;
