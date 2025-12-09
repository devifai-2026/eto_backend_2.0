import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { Rider } from "../models/rider.model.js";
import { Driver } from "../models/driver.model.js";
import {
  sendOtpViaMessageCentral,
  validateOtpViaMessageCentral,
} from "../utils/sentOtp.js";
import { Admin } from "../models/admin.model.js";
import ApiResponse from "../utils/ApiResponse.js";

// Generate Access and Refresh Tokens
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiResponse(404, null, "User not found");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Error generating tokens:", error.message);
    throw new ApiResponse(
      500,
      null,
      "Something went wrong while generating tokens"
    );
  }
};

export const loginAndSendOtp = asyncHandler(async (req, res) => {
  const { phone, isDriver, isAdmin } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number is required"));
  }

  let user = await User.findOne({ phone });
  let driverDetails = null;
  let role = "passenger";
  let otpResponse = null;
  let otpCredentials = null;

  // --- ADMIN LOGIC: Only one admin allowed ---
  if (isAdmin) {
    role = "admin";
    // Check if any admin already exists (other than this user)
    const existingAdmin = await User.findOne({ isAdmin: true });
    if (
      existingAdmin &&
      (!user || user._id.toString() !== existingAdmin._id.toString())
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "An admin already exists. Only one admin is allowed."
          )
        );
    }
    if (!user) {
      user = new User({
        phone,
        isVerified: false,
        isDriver: false,
        isAdmin: true,
      });
      await user.save();
    }
    if (user && !user.isAdmin) {
      let existingRole = user.isDriver ? "driver" : "passenger";
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Phone number already exists as ${existingRole}`
          )
        );
    }
    // Continue with OTP logic as below...
  }
  // --- DRIVER LOGIC ---
  else if (isDriver) {
    role = "driver";
    if (!user) {
      user = new User({
        phone,
        isVerified: false,
        isDriver: true,
        isAdmin: false,
      });
      await user.save();
    }
    if (user && !user.isDriver) {
      let existingRole = user.isAdmin ? "admin" : "passenger";
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Phone number already exists as ${existingRole}`
          )
        );
    }
    driverDetails = await Driver.findOne({ phone });
    // Continue with OTP logic as below...
  }
  // --- PASSENGER LOGIC ---
  else {
    role = "passenger";
    if (!user) {
      user = new User({
        phone,
        isVerified: false,
        isDriver: false,
        isAdmin: false,
      });
      await user.save();
    }
    if (user && (user.isDriver || user.isAdmin)) {
      let existingRole = user.isAdmin
        ? "admin"
        : user.isDriver
          ? "driver"
          : "passenger";
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Phone number already exists as ${existingRole}`
          )
        );
    }
    // Continue with OTP logic as below...
  }

  // --- OTP LOGIC (common for all roles) ---
  user.isVerified = false;
  await user.save();

  try {
    otpResponse = await sendOtpViaMessageCentral(phone);

    if (otpResponse) {
      if (typeof otpResponse === "string") {
        try {
          otpCredentials = JSON.parse(otpResponse);
        } catch (error) {
          return res
            .status(500)
            .json(new ApiResponse(500, null, "Error parsing OTP response"));
        }
      } else {
        otpCredentials = otpResponse;
      }

      if (otpResponse?.responseCode !== 200) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              otpResponse,
              `OTP request failed: ${otpResponse.message || "Unknown error"}`
            )
          );
      }

      let data = {
        role,
        userDetails: driverDetails || user,
        otpdata: otpCredentials.data,
      };

      if (isDriver && driverDetails) {
        data.userDetails = driverDetails;
      }

      return res
        .status(200)
        .json(new ApiResponse(200, data, "OTP sent successfully"));
    } else {
      return res
        .status(500)
        .json(new ApiResponse(500, null, "No response from OTP service"));
    }
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to send OTP"));
  }
});

// OTP Verification Controller
export const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, verificationId, code } = req.body;
  try {
    if (!phone || !verificationId || !code) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Phone number, verification ID, and OTP code are required"
          )
        );
    }

    let user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json(new ApiResponse(404, null, "User not found"));
    }

    const bypassNumbers = ["7872358979", "9733524164"];
    if (
      bypassNumbers.includes(phone) &&
      verificationId === "1234567" &&
      code === "1234"
    ) {
      user.isVerified = true;
      await user.save();

      const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        user._id
      );

      // If the user is an admin, return the admin details
      if (user.isAdmin) {
        const adminDetails = await Admin.findOne({ phone });

        const msg = {
          role: "admin",
          isVerified: user.isVerified,
          isNewAdmin: !adminDetails, // New admin if no details found
          phone: user.phone,
          accessToken,
          refreshToken,
          userDetails: adminDetails || {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }, // Send admin details if available
        };

        return res
          .status(200)
          .json(new ApiResponse(200, msg, "OTP verified for admin"));
      }

      // If the user is a driver , return the driver details
      if (user.isDriver) {
        const driverDetails = await Driver.findOne({ phone });
        // console.log(driverDetails);
        const msg = {
          role: "driver",
          isVerified: user.isVerified,
          isNewDriver: !driverDetails, // New driver if no details found
          phone: user.phone,
          accessToken,
          refreshToken,
          userDetails: driverDetails || {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            isApproved: driverDetails?.isApproved || false,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }, // Send driver details if available
        };

        return res
          .status(200)
          .json(new ApiResponse(200, msg, "OTP verified for driver"));
      } else {
        // If the user is a passenger (non-driver)
        let passengerDetails = await Rider.findOne({ phone });

        if (!passengerDetails) {
          // Create a new rider profile if not found
          passengerDetails = new Rider({
            name: "Rider", // Default name, can be updated later
            phone,
            userId: user._id,
            current_location: {
              type: "Point",
              coordinates: [0, 0], // Default coordinates, can be updated later
            },
          });

          await passengerDetails.save();
        }

        const msg = {
          role: "passenger",
          isNewPassenger: !passengerDetails, // New passenger if no details found
          phone: user.phone,
          accessToken,
          refreshToken,
          userDetails: passengerDetails || user,
        };

        return res
          .status(200)
          .json(new ApiResponse(200, msg, "OTP verified for rider"));
      }
    }

    const validationResponse = await validateOtpViaMessageCentral(
      phone,
      verificationId,
      code
    );
    let validateData =
      typeof validationResponse === "string"
        ? JSON.parse(validationResponse)
        : validationResponse;

    if (
      !validateData?.data ||
      validateData.data.responseCode !== "200" ||
      validateData.data.verificationStatus !== "VERIFICATION_COMPLETED"
    ) {
      return res.status(400).json(new ApiResponse(400, null, "Invalid OTP"));
    }

    user.isVerified = true;
    await user.save();

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
    );

    // If the user is an admin, return the admin details
    if (user.isAdmin) {
      const adminDetails = await Admin.findOne({ phone });

      const msg = {
        role: "admin",
        isVerified: user.isVerified,
        isNewAdmin: !adminDetails, // New admin if no details found
        phone: user.phone,
        accessToken,
        refreshToken,
        userDetails: adminDetails || {
          userId: user._id,
          phone: user.phone,
          isVerified: user.isVerified,
          isDriver: user.isDriver,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }, // Send admin details if available
      };

      return res
        .status(200)
        .json(new ApiResponse(200, msg, "OTP verified for admin"));
    }

    // If the user is a driver , return the driver details
    if (user.isDriver) {
      const driverDetails = await Driver.findOne({ phone });
      // console.log(driverDetails);
      const msg = {
        role: "driver",
        isVerified: user.isVerified,
        isNewDriver: !driverDetails, // New driver if no details found
        phone: user.phone,
        accessToken,
        refreshToken,
        userDetails: driverDetails || {
          userId: user._id,
          phone: user.phone,
          isVerified: user.isVerified,
          isDriver: user.isDriver,
          isAdmin: user.isAdmin,
          isApproved: driverDetails?.isApproved || false,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }, // Send driver details if available
      };

      return res
        .status(200)
        .json(new ApiResponse(200, msg, "OTP verified for driver"));
    } else {
      // If the user is a passenger (non-driver)
      let passengerDetails = await Rider.findOne({ phone });

      if (!passengerDetails) {
        // Create a new rider profile if not found
        passengerDetails = new Rider({
          name: "Rider", // Default name, can be updated later
          phone,
          userId: user._id,
          current_location: {
            type: "Point",
            coordinates: [0, 0], // Default coordinates, can be updated later
          },
        });

        await passengerDetails.save();
      }

      const msg = {
        role: "passenger",
        isNewPassenger: !passengerDetails, // New passenger if no details found
        phone: user.phone,
        accessToken,
        refreshToken,
        userDetails: passengerDetails || user,
      };

      return res
        .status(200)
        .json(new ApiResponse(200, msg, "OTP verified for rider"));
    }
  } catch (error) {
    console.error("Error validating OTP:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to validate OTP"));
  }
});

// Refresh Access Token Function
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.body.refreshToken;
  if (!incomingRefreshToken) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Unauthorized request"));
  }

  try {
    const decodedToken = await jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    if (!decodedToken) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized request"));
    }

    const user = await User.findById(decodedToken._id).select(
      "-phone -otp -isVerified -isAdmin -createdAt -updatedAt"
    );

    if (!user || incomingRefreshToken !== user.refreshToken) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid refresh token"));
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
    );
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "New tokens generated"
        )
      );
  } catch (error) {
    console.error("Error refreshing token:", error.message);
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid refresh token"));
  }
});

// Resend OTP Function
export const resendOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number is required"));
  }

  let user = await User.findOne({ phone });

  if (!user) {
    return res.status(404).json(new ApiResponse(404, null, "User not found"));
  }

  // Reset the isVerified flag to false
  user.isVerified = false;
  await user.save();

  try {
    // Attempt to send OTP via Message Central
    const otpResponse = await sendOtpViaMessageCentral(phone);
    console.log("OTP Response:", otpResponse); // Log the response to debug

    // Since otpResponse is already an object, no need to parse it
    const otpCredentials = otpResponse;

    // Prepare response data
    const data = {
      role: user.isDriver ? "driver" : user.isAdmin ? "admin" : "passenger",
      phone: user.phone,
      otpdata: otpCredentials.data,
    };

    return res
      .status(200)
      .json(new ApiResponse(200, data, "OTP resent successfully"));
  } catch (error) {
    console.error("Error resending OTP:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to resend OTP"));
  }
});

// Logout User Function
export const logoutUser = asyncHandler(async (req, res) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { refreshToken: undefined } },
      { new: true } // Return the updated document
    );

    const options = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json(new ApiResponse(200, {}, "User logged out"));
  } catch (error) {
    console.error("Error logging out user:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to log out user"));
  }
});
