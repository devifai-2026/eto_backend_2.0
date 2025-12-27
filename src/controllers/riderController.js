import { asyncHandler } from "../utils/asyncHandler.js";
import { Rider } from "../models/rider.model.js";
import { RideDetails } from "../models/rideDetails.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import { Driver } from "../models/driver.model.js";
import { ETOCard } from "../models/eto.model.js";
import { User } from "../models/user.model.js";

// Get All Riders Function
export const getAllRiders = asyncHandler(async (req, res) => {
  try {
    const riders = await Rider.find();

    const ridersSummary = riders.map((rider) => ({
      id: rider._id,
      name: rider.name,
      phone: rider.phone,
      photo: rider.photo,
      is_on_ride: rider.is_on_ride,
      total_rides: rider.ride_details ? rider.ride_details.length : 0,
      createdAt: rider.createdAt,
      // Do not include ride_details array
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(200, ridersSummary, "Riders retrieved successfully")
      );
  } catch (error) {
    console.error("Error retrieving riders:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve riders"));
  }
});

// Get Rider by ID Function
export const getRiderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Rider ID is required"));
  }

  try {
    const rider = await Rider.findById(id);

    if (!rider) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Rider not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, rider, "Rider retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving rider:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve rider"));
  }
});

// Get Current Ride Function
export const getCurrentRide = asyncHandler(async (req, res) => {
  const { id } = req.params; // Rider ID passed as a parameter

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Rider ID is required"));
  }

  try {
    // Find the rider by ID and ensure they're on a ride
    const rider = await Rider.findById(id);

    if (!rider) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "No active ride found for the given rider")
        );
    }

    // Retrieve the ride details using the current_ride_id
    const currentRide = await RideDetails.findOne({ riderId: id, isOn: true });

    if (!currentRide) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Ride details not found"));
    }
    const driverUserDetails = await Driver.findOne({
      phone: currentRide?.driverNumber,
    });
    const etoDetails = await ETOCard.findOne({
      driverId: currentRide?.driverId,
    });

    const rideAndDriverDetails = {
      ...currentRide.toObject(),
      driverUserDetails,
      etoDetails: {
        helpLine_num: etoDetails?.helpLine_num,
        eto_id_num: etoDetails?.eto_id_num,
      },
    };


    // console.log("Rider Current Ride", currentRide);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          rideAndDriverDetails,
          "Current ride retrieved successfully"
        )
      );
  } catch (error) {
    console.error("Error retrieving current ride:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve current ride"));
  }
});

// Get Rider Ride by ID Function
export const getRiderRideById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Rider ID is required"));
  }

  try {
    const rides = await RideDetails.find({ riderId: id });

    if (!rides.length) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "No rides found for the given rider"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, rides, "Rides retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving rides:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve rides"));
  }
});

// Get Rider's Ride History by Rider ID
export const getRiderRideHistory = asyncHandler(async (req, res) => {
  const { id } = req.params; // Rider ID passed in the request parameters

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Rider ID is required"));
  }

  try {
    // Find rider to ensure the ID is valid
    const rider = await Rider.findById(id);

    if (!rider) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Rider not found"));
    }

    // Retrieve the rides associated with the rider using riderId
    const rides = await RideDetails.find({ riderId: id })
      .populate({
        path: "driverId",
        select: "name driver_photo", // Select only the driver's name
      })
      .sort({ createdAt: -1 }); // Sort by most recent rides

    if (!rides.length) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "No rides found for the given rider"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, rides, "Ride history retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving ride history:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve ride history"));
  }
});

// Update Rider Profile Function
export const updateRiderProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Rider ID is required"));
  }

  delete req.body.phone;

  try {
    const rider = await Rider.findByIdAndUpdate(id, req.body, { new: true });

    if (!rider) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Rider not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, rider, "Rider profile updated successfully"));
  } catch (error) {
    console.error("Error updating rider profile:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update rider profile"));
  }
});

// Delete Rider Account Function
export const deleteRiderAccount = asyncHandler(async (req, res) => {
  const { id } = req.params; // Rider ID

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Rider ID is required"));
  }

  try {
    // Step 1: Find the rider
    const rider = await Rider.findById(id);
    if (!rider) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Rider not found"));
    }

    const userId = rider.userId;

    // Step 2: Delete the Rider
    await Rider.findByIdAndDelete(id);

    // Step 3: Delete the corresponding User
    if (userId) {
      await User.findByIdAndDelete(userId);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Account deleted successfully"));
  } catch (error) {
    console.error("Error deleting account:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to delete account"));
  }
});
