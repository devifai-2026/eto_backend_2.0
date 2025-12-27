import { asyncHandler } from "../utils/asyncHandler.js";
import { Rider } from "../models/rider.model.js";
import { Driver } from "../models/driver.model.js";
import generateOtp from "../utils/otpGenerate.js";
import { RideDetails } from "../models/rideDetails.model.js";
import mongoose from "mongoose";
import geolib from "geolib";
import dotenv from "dotenv";
import { Admin } from "../models/admin.model.js";
import { Khata } from "../models/khata.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import { ETOCard } from "../models/eto.model.js";
import { FareSettings } from "../models/fareSettings.model.js";
import { FranchiseCommissionSettings } from "../models/commissionSettings.model.js";
import { Franchise } from "../models/franchise.model.js";

dotenv.config({
  path: "./env",
});

// Looking Drivers for Ride new functionality
export const findAvailableDrivers = asyncHandler(async (req, res) => {
  const { riderId, dropLocation, pickUpLocation, ride_start_time } = req.body;
  console.log(req.body);
  const proximityRadius = 5; // Search radius in kilometers

  if (!riderId || !pickUpLocation || !dropLocation) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Rider ID, pickup, and drop locations are required"
        )
      );
  }

  try {
    // 1. Get fare settings from FareSettings model
    const fareSettings = await FareSettings.getSettings();
    const baseFare = fareSettings.base_fare || 20;
    const perKmCharge = fareSettings.per_km_charge || 8;

    // Check for night surcharge
    let nightSurchargeMultiplier = 1;
    if (ride_start_time) {
      const rideHour = new Date(ride_start_time).getHours();
      const nightStart = fareSettings.night_start_hour || 22;
      const nightEnd = fareSettings.night_end_hour || 6;

      if (nightStart < nightEnd) {
        // Normal case: night time doesn't cross midnight
        if (rideHour >= nightStart && rideHour < nightEnd) {
          nightSurchargeMultiplier =
            1 + (fareSettings.night_surcharge_percentage || 20) / 100;
        }
      } else {
        // Night time crosses midnight (e.g., 10 PM to 6 AM)
        if (rideHour >= nightStart || rideHour < nightEnd) {
          nightSurchargeMultiplier =
            1 + (fareSettings.night_surcharge_percentage || 20) / 100;
        }
      }
    }

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Rider not found"));
    }

    const pickupCoordinates = [
      pickUpLocation.longitude,
      pickUpLocation.latitude,
    ];

    // Find available drivers with their franchise info
    const availableDrivers = await Driver.find({
      current_location: {
        $near: {
          $geometry: { type: "Point", coordinates: pickupCoordinates },
          $maxDistance: proximityRadius * 1000, // Convert km to meters
        },
      },
      isActive: true,
      is_on_ride: false,
      due_wallet: { $lt: 500 },
    }).populate("franchiseId");

    if (availableDrivers.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { isAvailable: false },
            "No available drivers found"
          )
        );
    }

    // Calculate total distance from pickup to drop
    const totalKmPickupToDrop =
      geolib.getDistance(
        {
          latitude: pickUpLocation.latitude,
          longitude: pickUpLocation.longitude,
        },
        { latitude: dropLocation.latitude, longitude: dropLocation.longitude }
      ) / 1000; // Convert meters to kilometers

    // Get franchise commission settings for all franchises
    const franchiseIds = availableDrivers
      .filter(
        (d) =>
          d.franchiseId && d.franchiseId.isActive && d.franchiseId.isApproved
      )
      .map((d) => d.franchiseId._id);

    let franchiseCommissionSettings = {};
    if (franchiseIds.length > 0) {
      const settings = await FranchiseCommissionSettings.find({
        franchiseId: { $in: franchiseIds },
        isActive: true,
      });

      settings.forEach((setting) => {
        franchiseCommissionSettings[setting.franchiseId.toString()] = setting;
      });
    }

    // ---- Speed Settings ----
    const minSpeed = 18; // km/h (worst case in traffic)
    const maxSpeed = 30; // km/h (best case in traffic)

    // Prepare response data for each available driver
    const resData = await Promise.all(
      availableDrivers.map(async (driver) => {
        // Distance from driver's current location to pickup
        const driverDistanceToPickup =
          geolib.getDistance(
            {
              latitude: driver.current_location.coordinates[1],
              longitude: driver.current_location.coordinates[0],
            },
            {
              latitude: pickUpLocation.latitude,
              longitude: pickUpLocation.longitude,
            }
          ) / 1000; // Convert meters to kilometers

        // Total distance for pricing (driver -> pickup + pickup -> drop)
        const totalDistance = driverDistanceToPickup + totalKmPickupToDrop;

        // Fare Calculation with night surcharge
        const baseFareAmount = baseFare;
        const distanceCharge = totalDistance * perKmCharge;
        let totalPrice = Math.ceil(baseFareAmount + distanceCharge);

        // Apply night surcharge if applicable
        totalPrice = Math.ceil(totalPrice * nightSurchargeMultiplier);

        // Check if driver belongs to an active franchise
        let adminCommissionRate = 18; // Default admin commission
        let franchiseCommissionRate = 0;
        let franchiseId = null;
        let franchiseName = null;
        let adminProfit = 0;
        let franchiseProfit = 0;
        let driverProfit = 0;
        let hasFranchise = false;

        if (
          driver.franchiseId &&
          driver.franchiseId.isActive &&
          driver.franchiseId.isApproved
        ) {
          // Driver belongs to a franchise
          hasFranchise = true;
          franchiseId = driver.franchiseId._id;
          franchiseName = driver.franchiseId.name;

          // Get commission settings for this franchise
          const commissionSettings =
            franchiseCommissionSettings[franchiseId.toString()];

          if (commissionSettings) {
            adminCommissionRate = commissionSettings.admin_commission_rate;
            franchiseCommissionRate =
              commissionSettings.franchise_commission_rate;
          } else {
            // Use default franchise commission
            franchiseCommissionRate = 10; // Default franchise commission
          }

          // Calculate profits with franchise commission
          franchiseProfit = Math.ceil(
            (franchiseCommissionRate / 100) * totalPrice
          );
          adminProfit = Math.ceil((adminCommissionRate / 100) * totalPrice);
          driverProfit = Math.ceil(totalPrice - franchiseProfit - adminProfit);
        } else {
          // Driver does not belong to any franchise
          adminProfit = Math.ceil((adminCommissionRate / 100) * totalPrice);
          driverProfit = Math.ceil(totalPrice - adminProfit);
        }

        // ETA Calculation (range)
        const minTimeToPickup = (driverDistanceToPickup / maxSpeed) * 60; // minutes
        const maxTimeToPickup = (driverDistanceToPickup / minSpeed) * 60; // minutes

        return {
          driverId: driver._id,
          location: driver.current_location.coordinates,
          name: driver.name,
          phone: driver.phone,
          driver_photo: driver.driver_photo,
          hasFranchise: hasFranchise,
          franchiseId: franchiseId,
          franchiseName: franchiseName,
          distanceToPickup: driverDistanceToPickup.toFixed(2) + " km",
          estimatedTimeToPickup: `${minTimeToPickup.toFixed(
            2
          )} - ${maxTimeToPickup.toFixed(2)} mins`, // ETA Range
          fareBreakdown: {
            baseFare: baseFareAmount,
            totalDistance: totalDistance.toFixed(2),
            perKmCharge: perKmCharge,
            distanceCharge: Math.ceil(distanceCharge),
            nightSurchargeMultiplier: nightSurchargeMultiplier,
            isNightTime: nightSurchargeMultiplier > 1,
            nightSurchargePercentage:
              nightSurchargeMultiplier > 1
                ? fareSettings.night_surcharge_percentage || 20
                : 0,
          },
          totalPrice: totalPrice,
          commissionBreakdown: {
            adminCommissionRate: adminCommissionRate,
            franchiseCommissionRate: franchiseCommissionRate,
            adminProfit: adminProfit,
            franchiseProfit: franchiseProfit,
            driverProfit: driverProfit,
          },
          // Legacy fields for backward compatibility
          adminPercentage: adminCommissionRate,
          adminProfit: adminProfit,
          franchisePercentage: franchiseCommissionRate,
          franchiseProfit: franchiseProfit,
          driverProfit: driverProfit,
        };
      })
    );

    const finalResData = {
      availableDrivers: resData,
      fareSettings: {
        base_fare: baseFare,
        per_km_charge: perKmCharge,
        night_surcharge_percentage:
          fareSettings.night_surcharge_percentage || 20,
        night_hours: `${fareSettings.night_start_hour || 22}:00 - ${fareSettings.night_end_hour || 6}:00`,
      },
      totalKmPickupToDrop: totalKmPickupToDrop.toFixed(2) + " km",
      isAvailable: true,
    };

    console.log(finalResData);

    return res
      .status(200)
      .json(new ApiResponse(200, finalResData, "Drivers found successfully"));
  } catch (error) {
    console.error("Error finding available drivers:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to find available drivers"));
  }
});

// Accept Ride request new api - Modified for franchise support
export const acceptRide = (io) =>
  asyncHandler(async (req, res) => {
    const {
      driverId,
      riderId,
      dropLocation,
      pickup_location,
      totalKm,
      totalPrice,
      adminCommissionRate,
      franchiseCommissionRate,
      adminProfit,
      franchiseProfit,
      driverProfit,
    } = req.body;

    console.log("Accept Ride Request Body:", req.body);

    // Input validation
    if (
      !driverId ||
      !riderId ||
      !dropLocation ||
      !pickup_location ||
      totalKm === undefined ||
      totalPrice === undefined
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Driver ID, Rider ID, Drop Location, Pickup Location, Total Kilometers, and Total Price are required"
          )
        );
    }

    // Validate location formats
    if (
      !Array.isArray(pickup_location) ||
      pickup_location.length !== 2 ||
      !Array.isArray(dropLocation) ||
      dropLocation.length !== 2
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Pickup and Drop Locations must be arrays with [longitude, latitude]"
          )
        );
    }

    try {
      const rider = await Rider.findById(riderId);
      const driver = await Driver.findById(driverId).populate("franchiseId");

      // Check existence of rider and driver
      if (!rider) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Rider not found"));
      }
      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      // Check if rider or driver is already on a ride
      if (rider.is_on_ride) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Rider is already on a ride"));
      }
      if (driver.is_on_ride) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Driver is already on a ride"));
      }

      // If commission rates and profits are not provided, calculate them
      let finalAdminCommissionRate = adminCommissionRate || 18;
      let finalFranchiseCommissionRate = franchiseCommissionRate || 0;
      let finalAdminProfit = adminProfit || 0;
      let finalFranchiseProfit = franchiseProfit || 0;
      let finalDriverProfit = driverProfit || 0;
      let franchiseId = null;

      if (
        driver.franchiseId &&
        driver.franchiseId.isActive &&
        driver.franchiseId.isApproved
      ) {
        // Driver belongs to a franchise
        franchiseId = driver.franchiseId._id;

        // If commission rates are not provided, get them from settings
        if (!adminCommissionRate || !franchiseCommissionRate) {
          const commissionSettings = await FranchiseCommissionSettings.findOne({
            franchiseId: franchiseId,
            isActive: true,
          });

          if (commissionSettings) {
            finalAdminCommissionRate = commissionSettings.admin_commission_rate;
            finalFranchiseCommissionRate =
              commissionSettings.franchise_commission_rate;
          } else {
            finalFranchiseCommissionRate = 10; // Default franchise commission
          }
        }

        // If profits are not provided, calculate them
        if (!adminProfit || !franchiseProfit || !driverProfit) {
          finalFranchiseProfit = Math.ceil(
            (finalFranchiseCommissionRate / 100) * totalPrice
          );
          finalAdminProfit = Math.ceil(
            (finalAdminCommissionRate / 100) * totalPrice
          );
          finalDriverProfit = Math.ceil(
            totalPrice - finalFranchiseProfit - finalAdminProfit
          );
        }
      } else {
        // Driver does not belong to any franchise
        // If profits are not provided, calculate them
        if (!adminProfit || !driverProfit) {
          finalAdminProfit = Math.ceil(
            (finalAdminCommissionRate / 100) * totalPrice
          );
          finalDriverProfit = Math.ceil(totalPrice - finalAdminProfit);
        }
      }

      // Generate OTPs
      const pickupOtp = generateOtp();
      const dropOtp = generateOtp();

      const admin = await mongoose.model("Admin").findOne();
      if (!admin) {
        return res
          .status(500)
          .json(new ApiResponse(500, null, "Admin not found"));
      }

      // Create new ride details
      const newRide = new RideDetails({
        adminId: admin._id,
        driverId: driver._id,
        riderId: rider._id,
        driverNumber: Number(driver.phone),
        riderNumber: Number(rider.phone),
        pickup_location: {
          type: "Point",
          coordinates: pickup_location, // [longitude, latitude]
        },
        drop_location: {
          type: "Point",
          coordinates: dropLocation, // [longitude, latitude]
        },
        total_km: Number(totalKm),
        pickup_otp: pickupOtp,
        drop_otp: dropOtp,
        total_amount: totalPrice,
        admin_percentage: finalAdminCommissionRate,
        admin_profit: finalAdminProfit,
        driver_profit: finalDriverProfit,
        franchiseId: franchiseId, // Add franchise reference
        franchise_profit: finalFranchiseProfit, // Add franchise profit
        franchise_commission_rate: finalFranchiseCommissionRate,
      });

      await newRide.save();

      // Emit ride details to the rider and driver via Socket.IO
      if (rider.socketId) {
        console.log("emiting accept data to rider", rider.socketId);
        io.to(rider.socketId).emit("rideAccepted", {
          driverId: driver._id,
          riderId: riderId,
          rideId: newRide._id,
          riderLocation: rider.current_location,
          driverLocation: driver.current_location,
          totalPrice: newRide.total_amount,
          pickupOtp,
          dropOtp,
        });
      }

      if (driver.socketId) {
        io.to(driver.socketId).emit("rideDetails", {
          rideId: newRide._id,
          riderId: riderId,
          riderLocation: rider.current_location,
          pickupLocation: newRide.pickup_location,
          dropLocation: newRide.drop_location,
          pickupOtp,
          dropOtp,
          totalAmount: newRide.total_amount,
          adminProfit: finalAdminProfit,
          driverProfit: finalDriverProfit,
          franchiseProfit: finalFranchiseProfit,
          hasFranchise: !!franchiseId,
        });
      }

      return res
        .status(200)
        .json(new ApiResponse(200, newRide, "Ride accepted successfully"));
    } catch (error) {
      console.error("Error accepting the ride:", error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to accept the ride"));
    }
  });

// Reject Ride request
export const rejectRide = (io) =>
  asyncHandler(async (req, res) => {
    const { driverId, riderId } = req.body;

    // Validate input data
    if (!driverId || !riderId) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Driver ID and Rider ID are required")
        );
    }

    try {
      const rider = await Rider.findById(riderId);
      const driver = await Driver.findById(driverId);

      // Check existence of rider and driver
      if (!rider) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Rider not found"));
      }
      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      console.log("Emitting rideRejected to", rider.socketId);

      // Notify the rider via socket if they have a socket ID
      if (rider) {
        io.to(rider.socketId).emit("rideReject", {
          isBooked: false,
          message: "Your ride request has been rejected by the driver",
        });
      }

      // Send success response
      return res
        .status(200)
        .json(new ApiResponse(200, null, "Ride request rejected successfully"));
    } catch (error) {
      console.error("Error rejecting the ride:", error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to reject the ride"));
    }
  });

// Verify Pickup OTP
export const verifyPickUpOtp = (io) =>
  asyncHandler(async (req, res) => {
    const { rideId, pickupOtp } = req.body;

    if (!rideId || !pickupOtp) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Ride ID and Pickup OTP are required")
        );
    }

    try {
      // Find the ride, rider, and driver by their IDs
      const ride = await RideDetails.findById(rideId);
      if (!ride) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Ride not found"));
      }

      const rider = await Rider.findById(ride.riderId);
      const driver = await Driver.findById(ride.driverId);

      // Verify the pickup OTP
      if (ride.pickup_otp !== pickupOtp) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid Pickup OTP"));
      }

      // Set the ride status to 'on ride'
      rider.is_on_ride = true;
      rider.current_ride_id = ride._id;
      await rider.save();

      driver.is_on_ride = true;
      driver.current_ride_id = ride._id;
      await driver.save();

      ride.isPickUp_verify = true;
      ride.isRide_started = true;
      ride.started_time = Date.now();
      await ride.save();

      console.log("Rider socket ID:", rider.socketId);
      console.log("Driver socket ID:", driver.socketId);

      // Emit updates to both the rider and driver
      if (rider.socketId) {
        console.log(
          `sendinggggggg data after pickup otp verify to rider ${rider.socketId}`
        );
        io.to(rider.socketId).emit("pickupRider", {
          message: "Pickup OTP verified. Ride is now active.",
          isRide_started: true,
          rideId: ride._id,
        });
      }

      if (driver.socketId) {
        console.log(
          `sendinggggg data after pickup otp verify to driver ${driver.socketId}`
        );
        io.to(driver.socketId).emit("pickupOtpVerifiedToDriver", {
          message: "Pickup OTP verified. Ride is now active.",
          isRide_started: true,
          rideId: ride._id,
        });
      }

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            ride,
            "OTP verified successfully and ride is now active"
          )
        );
    } catch (error) {
      console.error("Error verifying OTPs:", error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to verify OTPs"));
    }
  });

// Verify Drop OTP
export const verifyDropOtp = (io) =>
  asyncHandler(async (req, res) => {
    const { rideId, dropOtp } = req.body;

    if (!rideId || !dropOtp) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Ride ID and Drop OTP are required"));
    }

    try {
      // Find the ride, rider, and driver by their IDs
      const ride = await RideDetails.findById(rideId);
      if (!ride) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Ride not found"));
      }

      const rider = await Rider.findById(ride.riderId);
      if (!rider) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Rider not found"));
      }

      const driver = await Driver.findById(ride.driverId);
      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      // Verify the drop OTP
      if (ride.drop_otp !== dropOtp) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid Drop OTP"));
      }

      // Update the rider's status and ride details
      rider.is_on_ride = false;
      rider.current_ride_id = null;

      await rider.save();

      // Update the driver's status and ride details
      driver.is_on_ride = false;
      driver.current_ride_id = null;

      await driver.save();

      // Update the ride status
      ride.isOn = false;
      ride.isDrop_verify = true;
      ride.isRide_started = false;
      ride.isRide_ended = true;
      ride.ride_end_time = Date.now();
      await ride.save();

      console.log("Rider socket ID:", rider.socketId);
      console.log("Driver socket ID:", driver.socketId);

      // Emit ride completion updates to both the rider and driver
      if (rider.socketId) {
        console.log(`Emitting ride completed data to rider, ${rider.socketId}`);
        io.to(rider.socketId).emit("rideVerifyRider", {
          message: "Ride completed and OTP verified",
          isAccept: false,
          isRide_started: false,
          isRide_ended: true,
        });
      }

      if (driver.socketId) {
        console.log(
          `Emitting ride completed data to driver, ${driver.socketId}`
        );
        io.to(driver.socketId).emit("rideCompletedToDriver", {
          message: "Ride completed and OTP verified",
          isAccept: false,
          isRide_started: false,
          isRide_ended: true,
        });
      }

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            ride,
            "OTP verified successfully and ride is now finished"
          )
        );
    } catch (error) {
      console.error("Error verifying OTPs:", error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to verify OTP"));
    }
  });

// Cancel ride API
export const cancelRide = (io) =>
  asyncHandler(async (req, res) => {
    const { rideId, riderId } = req.body;

    // Check if the required fields are provided
    if (!rideId || !riderId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Ride ID and Rider ID are required"));
    }

    try {
      // Find the ride by ID
      const ride = await RideDetails.findById(rideId);

      // Log the retrieved ride
      // console.log("Retrieved ride:", ride);

      // Check if the ride exists
      if (!ride) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Ride not found"));
      }

      // Check if the ride belongs to the rider requesting cancellation
      if (ride.riderId.toString() !== riderId) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              "You are not authorized to cancel this ride"
            )
          );
      }

      // Find the driver associated with the ride
      const driver = await Driver.findOne({ _id: ride.driverId });

      // Check if the driver exists
      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      // Delete the ride from the collection
      await RideDetails.findByIdAndDelete(rideId);

      // Notify the driver that the ride has been canceled via Socket.io
      if (driver.socketId) {
        io.to(driver.socketId).emit("cancelRide", {
          isCancel: true,
          message: "Ride Canceled",
        });
      }

      return res
        .status(200)
        .json(new ApiResponse(200, null, "Ride canceled successfully"));
    } catch (error) {
      console.error("Error canceling ride:", error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to cancel ride"));
    }
  });

// Update Payment Mode and Driver's Wallet - Modified for franchise support
export const updatePaymentMode = (io) =>
  asyncHandler(async (req, res) => {
    const { rideId, paymentMode } = req.body;

    if (!rideId || !paymentMode) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Ride ID and Payment Mode are required")
        );
    }

    if (!["cash", "online"].includes(paymentMode)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid payment mode"));
    }

    try {
      // Fetch ride details with franchise info
      const ride = await RideDetails.findById(rideId).populate([
        "driverId",
        "riderId",
        "adminId",
        "franchiseId",
      ]);

      if (!ride) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Ride not found"));
      }

      const {
        driverId,
        riderId,
        adminId,
        franchiseId,
        total_amount,
        driver_profit,
        admin_profit,
        franchise_profit = 0,
        franchise_commission_rate = 0,
        admin_percentage = 0,
      } = ride;

      // Fetch Driver, Admin, and Khata records
      const driver = await Driver.findById(driverId);
      const rider = await Rider.findById(riderId);
      const admin = await Admin.findById(adminId);

      // Find or create khata based on franchise status
      let khata;

      if (franchiseId) {
        // Driver belongs to a franchise
        khata = await Khata.findOne({
          driverId,
          franchiseId,
          adminId,
        });

        if (!khata) {
          // Create new khata for franchise driver
          khata = new Khata({
            driverId,
            adminId,
            franchiseId,
            driverdue: 0,
            admindue: 0,
            franchisedue: 0,
            due_payment_details: [],
          });
        }
      } else {
        // Driver does not belong to any franchise
        khata = await Khata.findOne({
          driverId,
          adminId,
          franchiseId: null,
        });

        if (!khata) {
          // Create new khata for non-franchise driver
          khata = new Khata({
            driverId,
            adminId,
            franchiseId: null,
            driverdue: 0,
            admindue: 0,
            franchisedue: 0,
            due_payment_details: [],
          });
        }
      }

      if (!rider) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Rider not found"));
      }

      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      // Update Ride Payment Mode
      ride.payment_mode = paymentMode;
      ride.isPayment_done = true;
      await ride.save();

      // Update Driver's Wallets
      if (paymentMode === "cash") {
        driver.cash_wallet += total_amount;
      } else if (paymentMode === "online") {
        driver.online_wallet += total_amount;
      }

      // Update due wallet based on franchise status
      if (franchiseId) {
        // For franchise driver: due_wallet = admin_profit + franchise_profit
        driver.due_wallet += admin_profit + franchise_profit;
      } else {
        // For non-franchise driver: due_wallet = admin_profit only
        driver.due_wallet += admin_profit;
      }

      // Update Driver's ride details
      driver.ride_details.push({
        rideDetailsId: rideId,
        paymentMode,
      });

      // Update Rider's ride details
      rider.ride_details.push({
        rideDetailsId: rideId,
        paymentMode,
      });

      // Update Khata based on franchise status
      khata.due_payment_details.push({
        driverId,
        rideId,
        total_price: total_amount,
        admin_profit,
        driver_profit,
        franchise_profit: franchise_profit || 0,
        franchise_commission_rate: franchise_commission_rate || 0,
        admin_commission_rate: admin_percentage || 0,
        payment_mode: paymentMode,
      });

      // Adjust khata balances based on franchise status
      if (franchiseId) {
        // For franchise driver
        khata.driverdue += driver_profit; // Money owed by the driver increases
        khata.admindue += admin_profit; // Money owed by the admin increases
        khata.franchisedue += franchise_profit; // Money owed to franchise increases

        // Update franchise earnings if franchise exists
        if (franchiseId && typeof franchiseId === "object") {
          // Import Franchise model
          const { Franchise } = await import("../models/franchise.model.js");
          await Franchise.findByIdAndUpdate(franchiseId._id, {
            $inc: { total_earnings: franchise_profit },
          });
        }
      } else {
        // For non-franchise driver
        khata.driverdue += driver_profit; // Money owed by the driver increases
        khata.admindue += admin_profit; // Money owed by the admin increases
        // franchisedue remains 0 for non-franchise drivers
      }

      await rider.save();
      await driver.save();
      await khata.save();

      // Update Admin's Wallet
      admin.due_wallet += admin_profit;
      await admin.save();

      // Emit updates to the rider and driver
      if (ride.riderId?.socketId) {
        io.to(ride.riderId.socketId).emit("paymentModeUpdated", {
          message: "Payment mode updated successfully",
          rideId: ride._id,
          paymentMode,
        });
      }

      if (driver.socketId) {
        io.to(driver.socketId).emit("paymentModeUpdated", {
          message: "Payment mode updated successfully",
          rideId: ride._id,
          paymentMode,
          hasFranchise: !!franchiseId,
          franchiseProfit: franchise_profit || 0,
          adminProfit: admin_profit,
          driverProfit: driver_profit,
        });
      }

      return res
        .status(200)
        .json(new ApiResponse(200, ride, "Payment mode updated successfully"));
    } catch (error) {
      console.error("Error updating payment mode:", error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to update payment mode"));
    }
  });

// API to get all active rides
export const getAllActiveRides = asyncHandler(async (req, res) => {
  try {
    // Extract query parameters
    const {
      adminId,
      franchiseId,
      search,
      page = "1",
      limit = "20",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Validate and parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Validate sort parameters
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "started_time",
      "total_km",
      "total_amount",
    ];
    const isValidSortField = validSortFields.includes(sortBy);
    const finalSortBy = isValidSortField ? sortBy : "createdAt";

    const isValidSortOrder = ["asc", "desc"].includes(sortOrder.toLowerCase());
    const finalSortOrder = isValidSortOrder ? sortOrder.toLowerCase() : "desc";

    // Build base query
    const baseQuery = { isOn: true };

    // Admin/Franchise access control
    let appliedFranchiseId = null;

    if (franchiseId) {
      if (!mongoose.Types.ObjectId.isValid(franchiseId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid franchise ID format"));
      }

      // Only apply franchise filter if adminId is NOT provided
      if (!adminId) {
        appliedFranchiseId = franchiseId;
      }
    }

    // Create aggregation pipeline
    const aggregationPipeline = [];

    // Match stage
    const matchStage = { $match: baseQuery };

    // Add franchise filter if needed
    if (appliedFranchiseId) {
      matchStage.$match.franchiseId = new mongoose.Types.ObjectId(
        appliedFranchiseId
      );
    }

    aggregationPipeline.push(matchStage);

    // Lookup driver and rider details
    aggregationPipeline.push(
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      {
        $unwind: {
          path: "$driver",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "riders",
          localField: "riderId",
          foreignField: "_id",
          as: "rider",
        },
      },
      {
        $unwind: {
          path: "$rider",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    // Filter by search term if provided
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const searchRegex = new RegExp(searchTerm, "i");

      aggregationPipeline.push({
        $match: {
          $or: [
            { "driver.name": { $regex: searchRegex } },
            { "driver.phone": { $regex: searchRegex } },
            { "rider.name": { $regex: searchRegex } },
            { "rider.phone": { $regex: searchRegex } },
          ],
        },
      });
    }

    // Add franchise info lookup if not filtered by franchise
    if (!appliedFranchiseId) {
      aggregationPipeline.push({
        $lookup: {
          from: "franchises",
          localField: "franchiseId",
          foreignField: "_id",
          as: "franchiseInfo",
        },
      });
    }

    // Get total count for pagination
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: "total" });

    const [countResult] = await RideDetails.aggregate(countPipeline);
    const totalRides = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(totalRides / limitNum);

    // Add sorting
    const sortStage = {};
    sortStage[finalSortBy] = finalSortOrder === "desc" ? -1 : 1;
    aggregationPipeline.push({ $sort: sortStage });

    // Add pagination
    aggregationPipeline.push({ $skip: skip }, { $limit: limitNum });

    // Project only necessary fields
    aggregationPipeline.push({
      $project: {
        rideId: "$_id",
        _id: 0,
        driver: {
          _id: "$driver._id",
          name: "$driver.name",
          phone: "$driver.phone",
          photo: "$driver.driver_photo",
          current_location: "$driver.current_location",
        },
        rider: {
          _id: "$rider._id",
          name: "$rider.name",
          phone: "$rider.phone",
          photo: "$rider.photo",
          current_location: "$rider.current_location",
        },
        pickup_location: 1,
        drop_location: 1,
        isOn: 1,
        isRide_started: 1,
        isRide_ended: 1,
        started_time: 1,
        ride_end_time: 1,
        total_km: 1,
        total_amount: 1,
        driver_profit: 1,
        admin_profit: 1,
        franchise_profit: 1,
        payment_mode: 1,
        isPickUp_verify: 1,
        isDrop_verify: 1,
        isPayment_done: 1,
        createdAt: 1,
        franchiseId: 1,
        franchiseInfo: { $arrayElemAt: ["$franchiseInfo", 0] },
      },
    });

    // Execute aggregation
    const activeRides = await RideDetails.aggregate(aggregationPipeline);

    // Prepare summary statistics
    let summary = {
      totalActiveRides: totalRides,
      totalDistance: 0,
      totalEarnings: 0,
    };

    if (activeRides.length > 0) {
      // Calculate total distance and earnings from all active rides
      const statsPipeline = [...aggregationPipeline.slice(0, -4)]; // Remove pagination and projection
      statsPipeline.push({
        $group: {
          _id: null,
          totalDistance: { $sum: "$total_km" },
          totalEarnings: { $sum: "$total_amount" },
        },
      });

      const [statsResult] = await RideDetails.aggregate(statsPipeline);
      if (statsResult) {
        summary.totalDistance = statsResult.totalDistance;
        summary.totalEarnings = statsResult.totalEarnings;
      }
    }

    // Generate response message
    let message = "Active rides retrieved successfully";

    if (appliedFranchiseId) {
      const franchise = await Franchise.findById(appliedFranchiseId)
        .select("name")
        .lean();
      message = `Franchise "${franchise?.name || appliedFranchiseId}" active rides retrieved`;
    } else if (adminId) {
      message = "All active rides retrieved (Admin view)";
    }

    if (search) {
      message += `, searched for: "${search}"`;
    }

    // Prepare response data
    const responseData = {
      summary,
      rides: activeRides,
      pagination: {
        total: totalRides,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filters: {
        search: search || null,
        franchiseId: appliedFranchiseId,
        adminId: adminId || null,
        sortBy: finalSortBy,
        sortOrder: finalSortOrder,
      },
    };

    return res.status(200).json(new ApiResponse(200, responseData, message));
  } catch (error) {
    console.error("Error fetching active rides:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve active rides"));
  }
});

// API to get total earnings of all rides where isRide_ended is true
export const getTotalEarningsOfEndedRides = asyncHandler(async (req, res) => {
  try {
    // Aggregate the rides where isRide_ended is true and sum the total_amount
    const result = await RideDetails.aggregate([
      {
        $match: {
          isRide_ended: true, // Only include rides where isRide_ended is true
        },
      },
      {
        $group: {
          _id: null, // Grouping all the documents together
          totalEarnings: { $sum: "$total_amount" }, // Sum up the total_amount of each ride
        },
      },
    ]);

    // If no ended rides found, return a message indicating that
    if (result.length === 0) {
      return res.status(404).json({
        message: "No ended rides found.",
        totalEarnings: 0,
      });
    }

    // Return the total earnings from all ended rides
    return res.status(200).json({
      message: "Total earnings of ended rides fetched successfully.",
      totalEarnings: result[0].totalEarnings, // Extract the total earnings from the result
    });
  } catch (error) {
    console.error(
      "Error fetching total earnings of ended rides:",
      error.message
    );
    return res.status(500).json({
      message: "Failed to fetch total earnings of ended rides.",
    });
  }
});

// Get Total Drivers with Details in Current Rides
export const getTotalDriversInCurrentRides = asyncHandler(async (req, res) => {
  try {
    // Find all active rides and populate driver details
    const activeRides = await RideDetails.find({ isOn: true })
      .populate("driverId", "name phone photo") // Populate driver details
      .select("driverId pickup_location"); // Include only required fields

    if (!activeRides || activeRides.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], "No active rides found", true));
    }

    // Filter rides with valid driver details and map the data
    const driverDetails = activeRides
      .filter((ride) => ride.driverId) // Ensure the driver exists
      .map((ride) => ({
        driverId: ride.driverId._id,
        name: ride.driverId.name,
        phone: ride.driverId.phone,
        photo: ride.driverId.photo,
        currentLocation: ride.pickup_location, // Include pickup location
      }));

    if (driverDetails.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            [],
            "No valid drivers found for active rides",
            true
          )
        );
    }

    // Return the driver details
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          driverDetails,
          "Driver details in current rides fetched successfully",
          true
        )
      );
  } catch (error) {
    console.error(
      "Error fetching driver details in current rides:",
      error.message
    );
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to fetch driver details in current rides",
          false
        )
      );
  }
});

// API to fetch the total number of rides
export const getTotalRides = asyncHandler(async (req, res) => {
  try {
    // Fetch all rides
    const rides = await RideDetails.find();

    // Count the total number of rides
    const totalRides = rides.length;

    // Return the total number of rides and the rides data
    return res.status(200).json({
      message: "Total rides fetched successfully.",
      totalRides,
      rides,
    });
  } catch (error) {
    console.error("Error fetching total rides:", error.message);
    return res.status(500).json({
      message: "Failed to fetch total rides.",
    });
  }
});

// API to get ride history with advanced filtering
export const getRideHistory = asyncHandler(async (req, res) => {
  try {
    // Extract query parameters
    const {
      adminId,
      franchiseId,
      driverId,
      riderId,
      search,
      startDate,
      endDate,
      paymentMode,
      rideStatus,
      minAmount,
      maxAmount,
      minDistance,
      maxDistance,
      page = "1",
      limit = "20",
      sortBy = "ride_end_time",
      sortOrder = "desc",
    } = req.query;

    // Validate and parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Validate sort parameters
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "ride_end_time",
      "started_time",
      "total_km",
      "total_amount",
      "admin_profit",
      "driver_profit",
      "franchise_profit",
    ];
    const isValidSortField = validSortFields.includes(sortBy);
    const finalSortBy = isValidSortField ? sortBy : "ride_end_time";

    const isValidSortOrder = ["asc", "desc"].includes(sortOrder.toLowerCase());
    const finalSortOrder = isValidSortOrder ? sortOrder.toLowerCase() : "desc";

    // Build base query for completed rides
    const baseQuery = {
      isRide_ended: true,
      isPayment_done: true,
    };

    // Admin/Franchise access control
    let appliedFranchiseId = null;

    if (franchiseId) {
      if (!mongoose.Types.ObjectId.isValid(franchiseId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid franchise ID format"));
      }

      // Only apply franchise filter if adminId is NOT provided
      if (!adminId) {
        appliedFranchiseId = franchiseId;
        baseQuery.franchiseId = new mongoose.Types.ObjectId(franchiseId);
      }
    }

    // Filter by driver
    if (driverId && mongoose.Types.ObjectId.isValid(driverId)) {
      baseQuery.driverId = new mongoose.Types.ObjectId(driverId);
    }

    // Filter by rider
    if (riderId && mongoose.Types.ObjectId.isValid(riderId)) {
      baseQuery.riderId = new mongoose.Types.ObjectId(riderId);
    }

    // Filter by payment mode
    if (paymentMode && ["cash", "online"].includes(paymentMode.toLowerCase())) {
      baseQuery.payment_mode = paymentMode.toLowerCase();
    }

    // Filter by ride status
    if (rideStatus) {
      const statusMap = {
        completed: { isRide_ended: true, isPayment_done: true },
        unpaid: { isRide_ended: true, isPayment_done: false },
        canceled: { isCancel_time: true },
      };
      if (statusMap[rideStatus.toLowerCase()]) {
        Object.assign(baseQuery, statusMap[rideStatus.toLowerCase()]);
      }
    }

    // Date range filter
    if (startDate || endDate) {
      baseQuery.ride_end_time = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        baseQuery.ride_end_time.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        baseQuery.ride_end_time.$lte = end;
      }
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      baseQuery.total_amount = {};
      if (minAmount) {
        baseQuery.total_amount.$gte = parseFloat(minAmount);
      }
      if (maxAmount) {
        baseQuery.total_amount.$lte = parseFloat(maxAmount);
      }
    }

    // Distance range filter
    if (minDistance || maxDistance) {
      baseQuery.total_km = {};
      if (minDistance) {
        baseQuery.total_km.$gte = parseFloat(minDistance);
      }
      if (maxDistance) {
        baseQuery.total_km.$lte = parseFloat(maxDistance);
      }
    }

    // Create aggregation pipeline
    const aggregationPipeline = [];

    // Match stage
    aggregationPipeline.push({ $match: baseQuery });

    // Lookup driver and rider details
    aggregationPipeline.push(
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      {
        $unwind: {
          path: "$driver",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "riders",
          localField: "riderId",
          foreignField: "_id",
          as: "rider",
        },
      },
      {
        $unwind: {
          path: "$rider",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    // Add franchise info lookup if not filtered by franchise
    if (!appliedFranchiseId) {
      aggregationPipeline.push({
        $lookup: {
          from: "franchises",
          localField: "franchiseId",
          foreignField: "_id",
          as: "franchiseInfo",
        },
      });
    }

    // Filter by search term if provided
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const searchRegex = new RegExp(searchTerm, "i");

      aggregationPipeline.push({
        $match: {
          $or: [
            { "driver.name": { $regex: searchRegex } },
            { "driver.phone": { $regex: searchRegex } },
            { "rider.name": { $regex: searchRegex } },
            { "rider.phone": { $regex: searchRegex } },
            { payment_mode: { $regex: searchRegex } },
          ],
        },
      });
    }

    // Get total count for pagination
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: "total" });

    const [countResult] = await RideDetails.aggregate(countPipeline);
    const totalRides = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(totalRides / limitNum);

    // Add sorting
    const sortStage = {};
    sortStage[finalSortBy] = finalSortOrder === "desc" ? -1 : 1;
    aggregationPipeline.push({ $sort: sortStage });

    // Add pagination
    aggregationPipeline.push({ $skip: skip }, { $limit: limitNum });

    // Project only necessary fields
    aggregationPipeline.push({
      $project: {
        rideId: "$_id",
        _id: 0,
        driver: {
          _id: "$driver._id",
          name: "$driver.name",
          phone: "$driver.phone",
          driver_photo: "$driver.driver_photo",
          license_number: "$driver.license_number",
          current_location: "$driver.current_location",
        },
        rider: {
          _id: "$rider._id",
          name: "$rider.name",
          phone: "$rider.phone",
          photo: "$rider.photo",
          current_location: "$rider.current_location",
        },
        pickup_location: 1,
        drop_location: 1,
        total_km: 1,
        total_amount: 1,
        admin_percentage: 1,
        admin_profit: 1,
        driver_profit: 1,
        franchise_profit: 1,
        franchise_commission_rate: 1,
        payment_mode: 1,
        isPayment_done: 1,
        isRide_started: 1,
        isRide_ended: 1,
        isOn: 1,
        isPickUp_verify: 1,
        isDrop_verify: 1,
        isCancel_time: 1,
        pickup_otp: 1,
        drop_otp: 1,
        started_time: 1,
        ride_end_time: 1,
        drop_time: 1,
        total_duration: 1,
        createdAt: 1,
        updatedAt: 1,
        franchiseId: 1,
        adminId: 1,
        franchiseInfo: { $arrayElemAt: ["$franchiseInfo", 0] },
      },
    });

    // Execute aggregation
    const rideHistory = await RideDetails.aggregate(aggregationPipeline);

    // Get ETO IDs for drivers
    const rideHistoryWithETO = await Promise.all(
      rideHistory.map(async (ride) => {
        const etoCard = await ETOCard.findOne({ driverId: ride.driver?._id });
        return {
          ...ride,
          driver: {
            ...ride.driver,
            eto_id_num: etoCard?.eto_id_num || null,
          },
        };
      })
    );

    // Prepare summary statistics
    let summary = {
      totalRides: totalRides,
      totalAmount: 0,
      totalAdminProfit: 0,
      totalDriverProfit: 0,
      totalFranchiseProfit: 0,
      avgAmount: 0,
      avgDistance: 0,
    };

    if (rideHistory.length > 0) {
      // Calculate total statistics
      const statsPipeline = [...aggregationPipeline.slice(0, -4)]; // Remove pagination and projection
      statsPipeline.push({
        $group: {
          _id: null,
          totalAmount: { $sum: "$total_amount" },
          totalAdminProfit: { $sum: "$admin_profit" },
          totalDriverProfit: { $sum: "$driver_profit" },
          totalFranchiseProfit: { $sum: "$franchise_profit" },
          avgAmount: { $avg: "$total_amount" },
          avgDistance: { $avg: "$total_km" },
          totalDistance: { $sum: "$total_km" },
        },
      });

      const [statsResult] = await RideDetails.aggregate(statsPipeline);
      if (statsResult) {
        summary.totalAmount = statsResult.totalAmount || 0;
        summary.totalAdminProfit = statsResult.totalAdminProfit || 0;
        summary.totalDriverProfit = statsResult.totalDriverProfit || 0;
        summary.totalFranchiseProfit = statsResult.totalFranchiseProfit || 0;
        summary.avgAmount = statsResult.avgAmount || 0;
        summary.avgDistance = statsResult.avgDistance || 0;
        summary.totalDistance = statsResult.totalDistance || 0;
      }
    }

    // Count by payment mode
    const paymentStatsPipeline = [...aggregationPipeline.slice(0, -4)];
    paymentStatsPipeline.push({
      $group: {
        _id: "$payment_mode",
        count: { $sum: 1 },
        totalAmount: { $sum: "$total_amount" },
      },
    });

    const paymentStats = await RideDetails.aggregate(paymentStatsPipeline);
    summary.paymentStats = paymentStats.reduce((acc, stat) => {
      acc[stat._id || "unknown"] = {
        count: stat.count,
        totalAmount: stat.totalAmount,
      };
      return acc;
    }, {});

    // Generate response message
    let message = "Ride history retrieved successfully";

    if (appliedFranchiseId) {
      const franchise = await Franchise.findById(appliedFranchiseId)
        .select("name")
        .lean();
      message = `Franchise "${franchise?.name || appliedFranchiseId}" ride history retrieved`;
    } else if (adminId) {
      message = "All ride history retrieved (Admin view)";
    }

    if (search) {
      message += `, searched for: "${search}"`;
    }
    if (startDate || endDate) {
      message += `, filtered by date range`;
    }

    // Prepare response data
    const responseData = {
      summary,
      rides: rideHistoryWithETO,
      pagination: {
        total: totalRides,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filters: {
        search: search || null,
        franchiseId: appliedFranchiseId,
        adminId: adminId || null,
        driverId: driverId || null,
        riderId: riderId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        paymentMode: paymentMode || null,
        rideStatus: rideStatus || null,
        sortBy: finalSortBy,
        sortOrder: finalSortOrder,
      },
    };

    return res
      .status(200)
      .json(new ApiResponse(200, responseData, message));
  } catch (error) {
    console.error("Error fetching ride history:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve ride history"));
  }
});

// API to get single ride by ID from history
export const getRideById = asyncHandler(async (req, res) => {
  try {
    const { rideId } = req.params;

    if (!rideId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Ride ID is required"));
    }

    // Validate if rideId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid Ride ID format"));
    }

    // Find ride by ID with populated data
    const ride = await RideDetails.findById(rideId)
      .populate({
        path: "driverId",
        select: "name phone driver_photo current_location license_number email",
      })
      .populate({
        path: "riderId",
        select: "name phone photo current_location email",
      })
      .populate({
        path: "franchiseId",
        select: "name email phone address",
      })
      .populate({
        path: "adminId",
        select: "name email",
      })
      .lean();

    if (!ride) {
      return res.status(404).json(new ApiResponse(404, null, "Ride not found"));
    }

    // Get ETO ID for driver
    const etoCard = await ETOCard.findOne({ driverId: ride.driverId?._id });
    
    // Format the response
    const rideData = {
      ...ride,
      rideId: ride._id,
      driver: {
        ...ride.driverId,
        eto_id_num: etoCard?.eto_id_num || null,
      },
      rider: ride.riderId,
      franchise: ride.franchiseId,
      admin: ride.adminId,
    };

    // Remove the original populated fields for cleaner response
    delete rideData.driverId;
    delete rideData.riderId;
    delete rideData.franchiseId;
    delete rideData.adminId;

    return res
      .status(200)
      .json(new ApiResponse(200, rideData, "Ride details fetched successfully"));
  } catch (error) {
    console.error("Error fetching ride by ID:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch ride details"));
  }
});

