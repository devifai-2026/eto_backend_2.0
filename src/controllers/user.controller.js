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
import { Franchise } from "../models/franchise.model.js";

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

// loginAndSendOtp Controller
export const loginAndSendOtp = asyncHandler(async (req, res) => {
  const { phone, isDriver, isAdmin, isFranchise } = req.body;

  // Validate required phone field
  if (!phone) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number is required"));
  }

  // Validate phone number format (10 digits)
  const phoneRegex = /^[0-9]{10}$/;
  if (!phoneRegex.test(phone)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Invalid phone number format. Must be 10 digits."
        )
      );
  }

  try {
    let user = await User.findOne({ phone });
    let driverDetails = null;
    let franchiseDetails = null;
    let adminDetails = null;
    let role = "passenger";
    let otpResponse = null;
    let otpCredentials = null;

    // Define bypass numbers for development
    const bypassNumbers = [
      "8145328152",
      "9733524164",
      "7872358979",
      "9830880062",
      "1234567890",
      "7872358975",
    ];

    // --- FRANCHISE LOGIC ---
    if (isFranchise) {
      role = "franchise";

      // Check if this user can be a franchise
      if (user) {
        // If user exists but is not marked as franchise
        if (!user.isFranchise) {
          // Check if user has other roles
          if (user.isDriver) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  "Phone number already registered as driver. Cannot be franchise."
                )
              );
          }
          if (user.isAdmin) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  "Phone number already registered as admin. Cannot be franchise."
                )
              );
          }
          // If user exists but not as franchise, update to franchise
          user.isFranchise = true;
          user.isVerified = false;
          await user.save();
        }
      } else {
        // Create new user as franchise
        user = new User({
          phone,
          isVerified: false,
          isDriver: false,
          isAdmin: false,
          isFranchise: true,
        });
        await user.save();
      }

      // Fetch franchise details if exists
      franchiseDetails = await Franchise.findOne({ phone });
    }
    // --- ADMIN LOGIC ---
    else if (isAdmin) {
      role = "admin";

      // Only one admin allowed logic
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

      if (user) {
        if (!user.isAdmin) {
          // Check if user has other roles
          if (user.isDriver) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  "Phone number already registered as driver. Cannot be admin."
                )
              );
          }
          if (user.isFranchise) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  "Phone number already registered as franchise. Cannot be admin."
                )
              );
          }
          // Update to admin
          user.isAdmin = true;
          user.isVerified = false;
          await user.save();
        }
      } else {
        // Create new admin user
        user = new User({
          phone,
          isVerified: false,
          isDriver: false,
          isAdmin: true,
          isFranchise: false,
        });
        await user.save();
      }

      // Fetch admin details if exists
      adminDetails = await Admin.findOne({ phone });
    }
    // --- DRIVER LOGIC ---
    else if (isDriver) {
      role = "driver";

      if (user) {
        if (!user.isDriver) {
          // Check if user has other roles
          if (user.isAdmin) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  "Phone number already registered as admin. Cannot be driver."
                )
              );
          }
          if (user.isFranchise) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  "Phone number already registered as franchise. Cannot be driver."
                )
              );
          }
          // Update to driver
          user.isDriver = true;
          user.isVerified = false;
          await user.save();
        }
      } else {
        // Create new driver user
        user = new User({
          phone,
          isVerified: false,
          isDriver: true,
          isAdmin: false,
          isFranchise: false,
        });
        await user.save();
      }

      // Fetch driver details if exists
      driverDetails = await Driver.findOne({ phone });
    }
    // --- PASSENGER (RIDER) LOGIC ---
    else {
      role = "passenger";

      if (user) {
        // Check if user is trying to login as passenger but has other role
        if (user.isDriver) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                "Phone number already registered as driver. Please login as driver."
              )
            );
        }
        if (user.isAdmin) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                "Phone number already registered as admin. Please login as admin."
              )
            );
        }
        if (user.isFranchise) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                "Phone number already registered as franchise. Please login as franchise."
              )
            );
        }
      } else {
        // Create new passenger user
        user = new User({
          phone,
          isVerified: false,
          isDriver: false,
          isAdmin: false,
          isFranchise: false,
        });
        await user.save();
      }
    }

    // Reset verification status
    user.isVerified = false;
    await user.save();

    // --- OTP SENDING LOGIC ---
    // Check if this is a bypass number
    if (bypassNumbers.includes(phone)) {
      // Generate dummy OTP response for bypass numbers
      otpCredentials = {
        data: {
          responseCode: "200",
          message: "OTP sent successfully",
          verificationId: "1234567",
          mobileNumber: phone,
          serviceName: "Bypass OTP Service",
        },
      };

      // Prepare response data based on role
      let userDetails = null;
      let isNew = false;

      switch (role) {
        case "franchise":
          userDetails = franchiseDetails;
          isNew = !franchiseDetails;
          break;
        case "admin":
          userDetails = adminDetails;
          isNew = !adminDetails;
          break;
        case "driver":
          userDetails = driverDetails;
          isNew = !driverDetails;
          break;
        case "passenger":
          userDetails = await Rider.findOne({ phone });
          isNew = !userDetails;
          break;
      }

      const responseData = {
        role,
        isNew,
        phone: user.phone,
        otpdata: otpCredentials.data,
        userDetails: userDetails || {
          userId: user._id,
          phone: user.phone,
          isVerified: user.isVerified,
          isDriver: user.isDriver,
          isAdmin: user.isAdmin,
          isFranchise: user.isFranchise,
        },
      };

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            responseData,
            "OTP sent successfully (bypass mode)"
          )
        );
    } else {
      // Send real OTP for non-bypass numbers
      try {
        otpResponse = await sendOtpViaMessageCentral(phone);

        if (!otpResponse) {
          return res
            .status(500)
            .json(new ApiResponse(500, null, "No response from OTP service"));
        }

        // Parse response if it's a string
        if (typeof otpResponse === "string") {
          try {
            otpCredentials = JSON.parse(otpResponse);
          } catch (parseError) {
            console.error("Error parsing OTP response:", parseError);
            otpCredentials = otpResponse;
          }
        } else {
          otpCredentials = otpResponse;
        }

        // Check if OTP sending was successful
        if (
          otpCredentials?.responseCode !== 200 &&
          otpCredentials?.data?.responseCode !== "200"
        ) {
          const errorMessage =
            otpCredentials?.message ||
            otpCredentials?.data?.message ||
            "Unknown error";
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                otpCredentials,
                `OTP request failed: ${errorMessage}`
              )
            );
        }

        // Prepare response data based on role
        let userDetails = null;
        let isNew = false;

        switch (role) {
          case "franchise":
            userDetails = franchiseDetails;
            isNew = !franchiseDetails;
            break;
          case "admin":
            userDetails = adminDetails;
            isNew = !adminDetails;
            break;
          case "driver":
            userDetails = driverDetails;
            isNew = !driverDetails;
            break;
          case "passenger":
            userDetails = await Rider.findOne({ phone });
            isNew = !userDetails;
            break;
        }

        const responseData = {
          role,
          isNew,
          phone: user.phone,
          otpdata: otpCredentials.data || otpCredentials,
          userDetails: userDetails || {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            isFranchise: user.isFranchise,
          },
        };

        return res
          .status(200)
          .json(new ApiResponse(200, responseData, "OTP sent successfully"));
      } catch (otpError) {
        console.error("Error sending OTP:", otpError.message);
        return res
          .status(500)
          .json(
            new ApiResponse(500, null, "Failed to send OTP. Please try again.")
          );
      }
    }
  } catch (error) {
    console.error("Error in loginAndSendOtp:", error.message);

    // Handle specific error types
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Validation failed: ${errorMessages.join(", ")}`
          )
        );
    }

    if (error.code === 11000) {
      // Duplicate key error
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Phone number already exists with different role."
          )
        );
    }

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Internal server error. Please try again later."
        )
      );
  }
});

// OTP Verification Controller
export const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, verificationId, code } = req.body;

  try {
    // Validate required fields
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

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid phone number format."));
    }

    // Validate OTP code format (4 digits)
    const otpRegex = /^[0-9]{4}$/;
    if (!otpRegex.test(code)) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Invalid OTP format. Must be 4 digits.")
        );
    }

    // Find user
    let user = await User.findOne({ phone });
    if (!user) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "User not found. Please request OTP first."
          )
        );
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "User is already verified. Please login directly."
          )
        );
    }

    // OTP bypass configuration
    const bypassConfig = {
      8145328152: {
        // Franchise bypass
        verificationId: "1234567",
        code: "1234",
        role: "franchise",
      },
      7872358975: {
        // Franchise bypass
        verificationId: "1234567",
        code: "1234",
        role: "franchise",
      },
      9733524164: {
        // Driver bypass
        verificationId: "1234567",
        code: "1234",
        role: "driver",
      },
      1234567890: {
        // Driver bypass
        verificationId: "1234567",
        code: "1234",
        role: "driver",
      },
      7872358979: {
        // Rider bypass
        verificationId: "1234567",
        code: "1234",
        role: "passenger",
      },
      9830880062: {
        // Admin bypass
        verificationId: "1234567",
        code: "1234",
        role: "admin",
      },
    };

    let isBypass = false;
    let bypassRole = null;

    // Check if this is a bypass number
    const bypassInfo = bypassConfig[phone];
    if (
      bypassInfo &&
      verificationId === bypassInfo.verificationId &&
      code === bypassInfo.code
    ) {
      isBypass = true;
      bypassRole = bypassInfo.role;
    }

    // If not bypass, validate real OTP
    if (!isBypass) {
      try {
        const validationResponse = await validateOtpViaMessageCentral(
          phone,
          verificationId,
          code
        );

        // Parse validation response
        let validateData;
        if (typeof validationResponse === "string") {
          try {
            validateData = JSON.parse(validationResponse);
          } catch (parseError) {
            console.error("Error parsing validation response:", parseError);
            return res
              .status(500)
              .json(
                new ApiResponse(500, null, "Error validating OTP response")
              );
          }
        } else {
          validateData = validationResponse;
        }

        // Check if OTP validation was successful
        const isValid =
          validateData?.data?.responseCode === "200" &&
          validateData?.data?.verificationStatus === "VERIFICATION_COMPLETED";

        if (!isValid) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                validateData,
                "Invalid OTP or verification failed. Please try again."
              )
            );
        }
      } catch (validationError) {
        console.error("Error validating OTP:", validationError.message);
        return res
          .status(500)
          .json(
            new ApiResponse(
              500,
              null,
              "Failed to validate OTP. Please try again."
            )
          );
      }
    }

    // Mark user as verified
    user.isVerified = true;
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
    );

    // Determine user role and fetch details
    let role;
    let userDetails;
    let isNew = false;

    if (isBypass) {
      role = bypassRole;
    } else {
      // Determine role based on user flags
      if (user.isAdmin) {
        role = "admin";
      } else if (user.isDriver) {
        role = "driver";
      } else if (user.isFranchise) {
        role = "franchise";
      } else {
        role = "passenger";
      }
    }

    // Fetch user details based on role
    switch (role) {
      case "franchise":
        userDetails = await Franchise.findOne({ phone });
        isNew = !userDetails;
        if (!userDetails) {
          userDetails = {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            isFranchise: user.isFranchise,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          };
        }
        break;

      case "admin":
        userDetails = await Admin.findOne({ phone });
        isNew = !userDetails;
        if (!userDetails) {
          userDetails = {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            isFranchise: user.isFranchise,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          };
        }
        break;

      case "driver":
        userDetails = await Driver.findOne({ phone });
        isNew = !userDetails;
        if (!userDetails) {
          userDetails = {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            isFranchise: user.isFranchise,
            isApproved: false,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          };
        }
        break;

      case "passenger":
        userDetails = await Rider.findOne({ phone });
        isNew = !userDetails;
        if (!userDetails) {
          // Create new rider profile
          userDetails = new Rider({
            name: "Rider",
            phone,
            userId: user._id,
            current_location: {
              type: "Point",
              coordinates: [0, 0],
            },
          });
          await userDetails.save();
        }
        break;
    }

    // Prepare success response
    const responseData = {
      success: true,
      role,
      isVerified: user.isVerified,
      isNew,
      phone: user.phone,
      accessToken,
      refreshToken,
      userDetails,
      timestamp: new Date(),
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          `OTP verified successfully for ${role}`
        )
      );
  } catch (error) {
    console.error("Error in verifyOtp:", error.message);

    // Handle specific error types
    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid token generation."));
    }

    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Token expired. Please login again."));
    }

    // Handle database errors
    if (error.name === "MongoError" || error.name === "MongoServerError") {
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Database error. Please try again."));
    }

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Internal server error. Please try again later."
        )
      );
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

  try {
    // Validate required phone field
    if (!phone) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Phone number is required"));
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid phone number format. Must be 10 digits."
          )
        );
    }

    // Find user
    let user = await User.findOne({ phone });
    if (!user) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "User not found. Please register first.")
        );
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "User is already verified. No need to resend OTP."
          )
        );
    }

    // Determine user role
    let role;
    if (user.isAdmin) {
      role = "admin";
    } else if (user.isDriver) {
      role = "driver";
    } else if (user.isFranchise) {
      role = "franchise";
    } else {
      role = "passenger";
    }

    // Define bypass numbers
    const bypassNumbers = [
      "8145328152",
      "9733524164",
      "7872358979",
      "9830880062",
    ];

    // OTP sending logic
    if (bypassNumbers.includes(phone)) {
      // Generate dummy OTP response for bypass numbers
      const otpCredentials = {
        data: {
          responseCode: "200",
          message: "OTP resent successfully",
          verificationId: "1234567",
          mobileNumber: phone,
          serviceName: "Bypass OTP Service",
          resendCount: user.resendCount || 1,
        },
      };

      // Fetch user details based on role
      let userDetails = null;
      switch (role) {
        case "franchise":
          userDetails = await Franchise.findOne({ phone });
          break;
        case "admin":
          userDetails = await Admin.findOne({ phone });
          break;
        case "driver":
          userDetails = await Driver.findOne({ phone });
          break;
        case "passenger":
          userDetails = await Rider.findOne({ phone });
          break;
      }

      // Prepare response data
      const responseData = {
        role,
        phone: user.phone,
        otpdata: otpCredentials.data,
        userDetails: userDetails || {
          userId: user._id,
          phone: user.phone,
          isVerified: user.isVerified,
          isDriver: user.isDriver,
          isAdmin: user.isAdmin,
          isFranchise: user.isFranchise,
        },
        message: "OTP resent successfully (bypass mode)",
      };

      // Track resend count
      if (!user.resendCount) {
        user.resendCount = 1;
      } else {
        user.resendCount += 1;
      }
      await user.save();

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            responseData,
            "OTP resent successfully (bypass mode)"
          )
        );
    } else {
      // Send real OTP for non-bypass numbers
      try {
        // Check resend limit (optional security feature)
        const maxResendAttempts = 5;
        const timeWindow = 15 * 60 * 1000; // 15 minutes

        if (user.lastResendAttempt) {
          const timeSinceLastAttempt =
            Date.now() - user.lastResendAttempt.getTime();
          const attemptsInWindow = user.resendAttemptsInWindow || 0;

          if (
            timeSinceLastAttempt < timeWindow &&
            attemptsInWindow >= maxResendAttempts
          ) {
            return res
              .status(429)
              .json(
                new ApiResponse(
                  429,
                  null,
                  "Too many OTP resend attempts. Please try again after 15 minutes."
                )
              );
          }
        }

        // Send OTP
        const otpResponse = await sendOtpViaMessageCentral(phone);

        if (!otpResponse) {
          return res
            .status(500)
            .json(new ApiResponse(500, null, "No response from OTP service"));
        }

        // Parse response
        let otpCredentials;
        if (typeof otpResponse === "string") {
          try {
            otpCredentials = JSON.parse(otpResponse);
          } catch (parseError) {
            console.error("Error parsing OTP response:", parseError);
            otpCredentials = otpResponse;
          }
        } else {
          otpCredentials = otpResponse;
        }

        // Check if OTP sending was successful
        if (
          otpCredentials?.responseCode !== 200 &&
          otpCredentials?.data?.responseCode !== "200"
        ) {
          const errorMessage =
            otpCredentials?.message ||
            otpCredentials?.data?.message ||
            "Unknown error";
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                otpCredentials,
                `Failed to resend OTP: ${errorMessage}`
              )
            );
        }

        // Update resend tracking
        const now = new Date();
        if (!user.lastResendAttempt) {
          user.lastResendAttempt = now;
          user.resendAttemptsInWindow = 1;
        } else {
          const timeSinceLastAttempt =
            now.getTime() - user.lastResendAttempt.getTime();
          if (timeSinceLastAttempt > timeWindow) {
            // Reset counter if outside time window
            user.lastResendAttempt = now;
            user.resendAttemptsInWindow = 1;
          } else {
            user.resendAttemptsInWindow += 1;
          }
        }

        if (!user.resendCount) {
          user.resendCount = 1;
        } else {
          user.resendCount += 1;
        }
        await user.save();

        // Fetch user details based on role
        let userDetails = null;
        switch (role) {
          case "franchise":
            userDetails = await Franchise.findOne({ phone });
            break;
          case "admin":
            userDetails = await Admin.findOne({ phone });
            break;
          case "driver":
            userDetails = await Driver.findOne({ phone });
            break;
          case "passenger":
            userDetails = await Rider.findOne({ phone });
            break;
        }

        // Prepare response data
        const responseData = {
          role,
          phone: user.phone,
          otpdata: otpCredentials.data || otpCredentials,
          userDetails: userDetails || {
            userId: user._id,
            phone: user.phone,
            isVerified: user.isVerified,
            isDriver: user.isDriver,
            isAdmin: user.isAdmin,
            isFranchise: user.isFranchise,
          },
          resendCount: user.resendCount,
          cooldown:
            user.resendAttemptsInWindow >= maxResendAttempts
              ? "Please wait before requesting more OTPs"
              : null,
        };

        return res
          .status(200)
          .json(new ApiResponse(200, responseData, "OTP resent successfully"));
      } catch (otpError) {
        console.error("Error resending OTP:", otpError.message);

        // Update error count
        if (!user.otpErrorCount) {
          user.otpErrorCount = 1;
        } else {
          user.otpErrorCount += 1;
        }
        await user.save();

        return res
          .status(500)
          .json(
            new ApiResponse(
              500,
              null,
              "Failed to resend OTP. Please try again."
            )
          );
      }
    }
  } catch (error) {
    console.error("Error in resendOtp:", error.message);

    // Handle specific error types
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Validation failed: ${errorMessages.join(", ")}`
          )
        );
    }

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Internal server error. Please try again later."
        )
      );
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
