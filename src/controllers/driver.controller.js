import { asyncHandler } from "../utils/asyncHandler.js";
import { Driver } from "../models/driver.model.js";
import { User } from "../models/user.model.js";
import { RideDetails } from "../models/rideDetails.model.js";
import { ETOCard } from "../models/eto.model.js";
import { WithdrawalLogs } from "../models/withdrawlLogs.model.js";
import { getCurrTime } from "../utils/getCurrTime.js";
import { getCurrentLocalDate } from "../utils/getCurrentLocalDate.js";
import { mongoose } from "mongoose";
import { Rider } from "../models/rider.model.js";
import { generateRandom3DigitNumber } from "../utils/otpGenerate.js";
import { Khata } from "../models/khata.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import geolib from "geolib";
import { Franchise } from "../models/franchise.model.js";
import { Admin } from "./../models/admin.model.js";
import { FranchiseCommissionSettings } from "../models/commissionSettings.model.js";

// Create Driver Function
export const createDriver = asyncHandler(async (req, res) => {
  const { phone, pin_code } = req.body;

  if (!phone || !pin_code) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Phone number and pin code are required")
      );
  }

  try {
    const existsUser = await User.findOne({ phone });
    if (!existsUser || !existsUser.isDriver) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "User does not exist or is not marked as a driver"
          )
        );
    }

    const existsDriver = await Driver.findOne({ phone });
    if (existsDriver) {
      return res
        .status(200)
        .json(new ApiResponse(200, null, "Driver already exists"));
    }

    // Check if this pincode is accessible by any franchise
    let franchiseId = null;
    const franchise = await Franchise.findOne({
      "accessible_pincodes.pincode": pin_code,
      "accessible_pincodes.isActive": true,
      isActive: true,
      isApproved: true,
    });

    if (franchise) {
      franchiseId = franchise._id;
      console.log(
        `Driver assigned to franchise: ${franchise.name} for pincode: ${pin_code}`
      );
    }

    // Generate a unique 3-digit `eto_id_num`
    let eto_id_num;
    let isUnique = false;
    while (!isUnique) {
      eto_id_num = generateRandom3DigitNumber();
      const existingEtoCard = await ETOCard.findOne({ eto_id_num });
      if (!existingEtoCard) {
        isUnique = true;
      }
    }

    // Set default coordinates if current location is not provided or contains null values
    const defaultCoordinates = [0, 0];
    const driverData = {
      ...req.body,
      userId: existsUser._id,
      franchiseId: franchiseId, // Assign franchise if found
      current_location: {
        type: "Point",
        coordinates: req.body.current_location?.coordinates?.every(
          (coord) => coord != null
        )
          ? req.body.current_location.coordinates
          : defaultCoordinates,
      },
    };

    const newDriver = new Driver(driverData);
    const savedDriver = await newDriver.save();

    const etoCardData = {
      driverId: savedDriver._id,
      userId: existsUser._id,
      eto_id_num: `ETO ${eto_id_num}`, // Use the unique 3-digit number generated above
      id_details: {
        name: existsUser.name,
        email: existsUser.email,
        village: req.body.village,
        police_station: req.body.police_station,
        landmark: req.body.landmark,
        post_office: req.body.post_office,
        district: req.body.district,
        pin_code: req.body.pin_code,
        // aadhar_number: req.body.aadhar_number,
        driver_photo: req.body.driver_photo,
        car_photo: req.body.car_photo,
      },
      helpLine_num: req.body.helpLine_num,
    };

    const newETOCard = new ETOCard(etoCardData);
    const savedETOCard = await newETOCard.save();

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          driver: savedDriver,
          etoCard: savedETOCard,
          franchiseAssigned: !!franchiseId,
          franchiseName: franchise ? franchise.name : null,
          needsApprovalFrom: franchiseId ? "franchise" : "admin",
        },
        `Driver created successfully. ${
          franchiseId
            ? `Assigned to franchise: ${franchise.name}. Waiting for franchise approval.`
            : "Not assigned to any franchise. Waiting for admin approval."
        }`
      )
    );
  } catch (error) {
    console.error("Error creating driver:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create driver"));
  }
});

// Get All Drivers Function
export const getAllDrivers = asyncHandler(async (req, res) => {
  try {
    // Extract and validate query parameters
    const { 
      adminId, 
      franchiseId, 
      search, 
      isActive, 
      isOnRide,
      page = '1', 
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Validate and parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));

    // Validate sort parameters
    const validSortFields = ['createdAt', 'name', 'total_earning', 'total_complete_rides'];
    const isValidSortField = validSortFields.includes(sortBy);
    const finalSortBy = isValidSortField ? sortBy : 'createdAt';
    
    const isValidSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase());
    const finalSortOrder = isValidSortOrder ? sortOrder.toLowerCase() : 'desc';

    // Build query object
    const baseQuery = {};

    // Admin/Franchise access control
    let appliedFranchiseId = null;
    
    if (franchiseId) {
      if (!mongoose.Types.ObjectId.isValid(franchiseId)) {
        return res.status(400).json(
          new ApiResponse(400, null, "Invalid franchise ID format")
        );
      }
      
      // Only apply franchise filter if adminId is NOT provided
      if (!adminId) {
        baseQuery.franchiseId = franchiseId;
        appliedFranchiseId = franchiseId;
      }
    }

    // Search functionality
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      const searchRegex = new RegExp(searchTerm, 'i');
      
      baseQuery.$or = [
        { name: { $regex: searchRegex } },
        { phone: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { license_number: { $regex: searchRegex } }
      ];
    }

    // Boolean filters
    if (isActive !== undefined) {
      if (isActive === 'true' || isActive === 'false') {
        baseQuery.isActive = isActive === 'true';
      } else {
        return res.status(400).json(
          new ApiResponse(400, null, "isActive must be 'true' or 'false'")
        );
      }
    }

    if (isOnRide !== undefined) {
      if (isOnRide === 'true' || isOnRide === 'false') {
        baseQuery.is_on_ride = isOnRide === 'true';
      } else {
        return res.status(400).json(
          new ApiResponse(400, null, "isOnRide must be 'true' or 'false'")
        );
      }
    }

    // Calculate skip for pagination
    const skip = (pageNum - 1) * limitNum;

    // Configure sorting
    const sortOptions = {};
    sortOptions[finalSortBy] = finalSortOrder === 'desc' ? -1 : 1;

    // ====================
    // GET SUMMARY STATISTICS
    // ====================
    let summaryStats = {
      totalDrivers: 0,
      totalActiveDrivers: 0,
      totalEarnings: 0,
      totalRides: 0
    };

    // Get total drivers count
    summaryStats.totalDrivers = await Driver.countDocuments(baseQuery);

    // Get active drivers count
    const activeQuery = { ...baseQuery, isActive: true };
    summaryStats.totalActiveDrivers = await Driver.countDocuments(activeQuery);

    // Get driver IDs for earnings and rides calculation
    const driversForStats = await Driver.find(baseQuery).select('_id').lean();
    const driverIds = driversForStats.map(driver => driver._id);

    if (driverIds.length > 0) {
      // Get total earnings and rides from RideDetails
      const statsAggregation = await RideDetails.aggregate([
        {
          $match: {
            driverId: { $in: driverIds },
            isRide_ended: true
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$driver_profit" },
            totalRides: { $sum: 1 }
          }
        }
      ]);

      if (statsAggregation.length > 0) {
        summaryStats.totalEarnings = Math.ceil(statsAggregation[0].totalEarnings);
        summaryStats.totalRides = statsAggregation[0].totalRides;
      }
    }

    // ====================
    // GET PAGINATED DRIVERS
    // ====================
    // Get total count for pagination
    const totalDrivers = summaryStats.totalDrivers;
    const totalPages = Math.ceil(totalDrivers / limitNum);

    // If no drivers found, return early with summary
    if (totalDrivers === 0) {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            summary: summaryStats,
            drivers: [],
            pagination: {
              total: totalDrivers,
              page: pageNum,
              limit: limitNum,
              totalPages,
              hasNext: false,
              hasPrev: false
            },
            filters: {
              search: search || null,
              isActive: isActive || null,
              isOnRide: isOnRide || null,
              franchiseId: appliedFranchiseId,
              adminId: adminId || null,
              sortBy: finalSortBy,
              sortOrder: finalSortOrder
            }
          },
          "No drivers found matching the criteria"
        )
      );
    }

    // Execute query with pagination - select only needed fields
    const drivers = await Driver.find(baseQuery)
      .select('_id name phone email createdAt isActive is_on_ride total_earning total_complete_rides userId')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get ETO card numbers for these drivers
    const etoCards = await ETOCard.find({ 
      driverId: { $in: drivers.map(d => d._id) } 
    })
    .select('driverId eto_id_num')
    .lean();

    // Create ETO card map
    const etoCardMap = {};
    etoCards.forEach(card => {
      etoCardMap[card.driverId.toString()] = card.eto_id_num;
    });

    // Format drivers for response
    const formattedDrivers = drivers.map(driver => {
      return {
        id: driver._id,
        userId: driver.userId,
        name: driver.name,
        joinedDate: driver.createdAt.toISOString().split('T')[0], // YYYY-MM-DD format
        contact: {
          phone: driver.phone,
          email: driver.email
        },
        etoIdNumber: etoCardMap[driver._id.toString()] || 'N/A',
        status: driver.isActive ? 'Active' : 'Inactive',
        totalEarnings: Math.ceil(driver.total_earning || 0),
        totalRides: driver.total_complete_rides || 0,
        isOnRide: driver.is_on_ride || false,
        // Additional quick status
        availability: driver.isActive 
          ? (driver.is_on_ride ? 'On Ride' : 'Available') 
          : 'Offline'
      };
    });

    // ====================
    // FORMAT RESPONSE
    // ====================
    // Generate response message
    let message = "Drivers retrieved successfully";
    
    if (appliedFranchiseId) {
      const franchise = await Franchise.findById(appliedFranchiseId).select('name').lean();
      message = `Franchise "${franchise?.name || appliedFranchiseId}" drivers retrieved`;
    } else if (adminId) {
      message = "All drivers retrieved (Admin view)";
    }
    
    if (search) {
      message += `, searched for: "${search}"`;
    }

    // Prepare response
    const responseData = {
      summary: {
        ...summaryStats,
        totalInactiveDrivers: summaryStats.totalDrivers - summaryStats.totalActiveDrivers,
        avgEarningsPerDriver: summaryStats.totalDrivers > 0 
          ? Math.ceil(summaryStats.totalEarnings / summaryStats.totalDrivers) 
          : 0,
        avgRidesPerDriver: summaryStats.totalDrivers > 0 
          ? Math.ceil(summaryStats.totalRides / summaryStats.totalDrivers) 
          : 0
      },
      drivers: formattedDrivers,
      pagination: {
        total: totalDrivers,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      filters: {
        search: search || null,
        isActive: isActive || null,
        isOnRide: isOnRide || null,
        franchiseId: appliedFranchiseId,
        adminId: adminId || null,
        sortBy: finalSortBy,
        sortOrder: finalSortOrder
      }
    };

    return res.status(200).json(
      new ApiResponse(200, responseData, message)
    );

  } catch (error) {
    console.error("Error in getAllDrivers:", {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    
    return res.status(500).json(
      new ApiResponse(500, null, "An error occurred while retrieving drivers")
    );
  }
});

// Get Driver by ID Function
export const getDriverById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    const driver = await Driver.findOne({ userId: id }).populate(
      "ride_details.rideDetailsId"
    );

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Calculate total completed kilometers
    let totalKm = 0;

    for (const rideEntry of driver.ride_details) {
      const ride = rideEntry.rideDetailsId;

      if (ride && ride.isRide_ended) {
        const pickup = ride.pickup_location?.coordinates;
        const drop = ride.drop_location?.coordinates;

        if (pickup && drop && pickup.length === 2 && drop.length === 2) {
          const distanceInMeters = geolib.getDistance(
            { latitude: pickup[1], longitude: pickup[0] },
            { latitude: drop[1], longitude: drop[0] }
          );

          const distanceInKm = distanceInMeters / 1000;
          totalKm += distanceInKm;
        }
      }
    }

    // Round to 2 decimal places and assign to schema field
    driver.total_completed_km = Math.round(totalKm * 100) / 100;

    // Optional: save it to DB (uncomment if needed)
    // await driver.save();

    const responseData = {
      current_location: driver.current_location,
      total_completed_km: Math.round(totalKm * 100) / 100,
      _id: driver._id,
      userId: driver.userId,
      phone: driver.phone,
      login_time: driver.login_time,
      logout_time: driver.logout_time,
      isActive: driver.isActive,
      isApproved: driver.isApproved,
      socketId: driver.socketId,
      due_wallet: driver.due_wallet,
      cash_wallet: driver.cash_wallet,
      online_wallet: driver.online_wallet,
      total_earning: driver.total_earning,
      name: driver.name,
      email: driver.email,
      village: driver.village,
      police_station: driver.police_station,
      landmark: driver.landmark,
      post_office: driver.post_office,
      district: driver.district,
      pin_code: driver.pin_code,
      // aadhar_number: driver.aadhar_number,
      driver_photo: driver.driver_photo,
      car_photo: driver.car_photo,
      license_number: driver.license_number,
      aadhar_front_photo: driver.aadhar_front_photo,
      aadhar_back_photo: driver.aadhar_back_photo,
      total_complete_rides: driver.total_complete_rides,
      is_on_ride: driver.is_on_ride,
      current_ride_id: driver.current_ride_id,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, responseData, "Driver retrieved successfully")
      );
  } catch (error) {
    console.error("Error retrieving driver:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve driver"));
  }
});

// Get Driver registered time by id
export const getDriverRegistrationTimeById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    // Find the driver by userId
    const driver = await Driver.findOne({ userId: id }).select(
      "createdAt name"
    );

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          name: driver.name,
          registrationTime: driver.createdAt, // Use createdAt field
        },
        "Driver registration time retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error retrieving driver registration time:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to retrieve driver registration time"
        )
      );
  }
});

// Get Driver Ride by ID Function
export const getDriverRideById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    // First, find the driver by ID in the Driver collection
    const driver = await Driver.findById(id);
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Then, find rides from the RideDetails collection where the driverId matches
    const rides = await RideDetails.find({ driverId: driver._id });
    if (!rides || rides.length === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "No rides found for this driver"));
    }

    // Return the rides associated with the driver
    return res
      .status(200)
      .json(new ApiResponse(200, rides, "Driver rides retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving driver rides:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve driver rides"));
  }
});

// Get Driver's Current Ride Function
export const getCurrentRide = asyncHandler(async (req, res) => {
  const { id } = req.params; // driver ID

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    let resData = null;

    // Find the driver by ID
    const driver = await Driver.findById(id);
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Fetch the current ride details
    const currentRide = await RideDetails.findOne({ driverId: id, isOn: true });

    const rider = await Rider.findById(currentRide?.riderId);

    // console.log(currentRide)
    // console.log(rider)

    resData = {
      currentRide,
      riderLocation: rider.current_location,
    };

    // console.log("Ride details", currentRide);
    // console.log("Rider",rider.current_location)

    if (!currentRide && !rider) {
      return res
        .status(404)
        .json(new ApiResponse(404, resData, "Current ride details not found"));
    }

    // console.log("Ride details",resData)

    // Return the current ride details
    return res
      .status(200)
      .json(
        new ApiResponse(200, resData, "Current ride retrieved successfully")
      );
  } catch (error) {
    console.error("Error retrieving current ride:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve current ride"));
  }
});

// Get Driver's Ride History Function with Debugging
export const getRideHistory = asyncHandler(async (req, res) => {
  const { id } = req.params; // driver ID

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    // Find the driver by ID and populate ride_details.rideDetailsId to ensure proper references.
    const driver = await Driver.findById(id).populate(
      "ride_details.rideDetailsId"
    );
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Ensure ride_details array is valid and extract ride IDs
    const rideIds =
      driver.ride_details?.map(
        (ride) => ride.rideDetailsId?._id || ride.rideDetailsId
      ) || [];

    if (!rideIds.length) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "No ride history found for this driver")
        );
    }

    // Fetch all rides associated with these IDs
    const rides = await RideDetails.find({ _id: { $in: rideIds } });

    // Identify missing ride IDs
    const missingRides = rideIds.filter(
      (rideId) => !rides.some((ride) => ride._id.equals(rideId))
    );

    if (missingRides.length > 0) {
      console.warn(
        "Missing ride details for the following ride IDs:",
        missingRides
      );
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { rides, missingRides },
          "Ride history retrieved successfully"
        )
      );
  } catch (error) {
    console.error("Error retrieving ride history:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve ride history"));
  }
});

// Update Driver Profile Function
export const updateDriverProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  delete req.body.phone;

  try {
    const driver = await Driver.findByIdAndUpdate(id, req.body, { new: true });
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, driver, "Driver profile updated successfully")
      );
  } catch (error) {
    console.error("Error updating driver profile:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update driver profile"));
  }
});

// Get All Active Drivers Function
export const getAllActiveDrivers = asyncHandler(async (req, res) => {
  try {
    // Find all drivers where isActive is true
    const activeDrivers = await Driver.find({ isActive: true });

    // Check if no active drivers are found
    if (!activeDrivers || activeDrivers.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { total: 0, drivers: [] },
            "No active drivers found"
          )
        );
    }

    // Return active drivers with their total count
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { total: activeDrivers.length, drivers: activeDrivers },
          "Active drivers retrieved successfully"
        )
      );
  } catch (error) {
    console.error("Error retrieving active drivers:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve active drivers"));
  }
});

// Activate Driver Function
export const activateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    // Find the driver by ID and update `isActive` to true
    const driver = await Driver.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, driver, "Driver activated successfully"));
  } catch (error) {
    console.error("Error activating driver:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to activate driver"));
  }
});

// Deactivate Driver Function
export const deactivateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    // Find the driver by ID and update `isActive` to false
    const driver = await Driver.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, driver, "Driver deactivated successfully"));
  } catch (error) {
    console.error("Error deactivating driver:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to deactivate driver"));
  }
});

// Delete Driver and associated records
export const deleteDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  try {
    // Step 1: Find the driver by ID
    const driver = await Driver.findById(id);
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Step 2: Delete related Khata entries
    await Khata.deleteMany({ driverId: driver._id });

    // Step 3: Delete the associated User
    await User.findByIdAndDelete(driver.userId);

    // Step 4: Delete the Driver
    await Driver.findByIdAndDelete(id);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Driver and related data deleted successfully"
        )
      );
  } catch (error) {
    console.error("Error deleting driver and related data:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to delete driver and related data")
      );
  }
});

// Get Today's Rides
export const getTodaysRides = asyncHandler(async (req, res) => {
  const { driverId } = req.body; // Driver ID passed in request body

  try {
    // Get the current date and set the start and end of the day
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)); // 00:00:00 of today
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)); // 23:59:59 of today

    // Query to find today's rides for the given driver
    const rides = await RideDetails.find({
      driverId: new mongoose.Types.ObjectId(driverId),
      ride_end_time: { $gte: startOfDay, $lte: endOfDay }, // Filter by today's date
    })
      .populate("driverId", "name phone") // Optionally populate driver details if needed
      .exec();

    if (rides.length === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "No rides found for today."));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, { rides }, "Today's rides fetched successfully.")
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch today's rides."));
  }
});

// Get Today's Earnings
export const getTodaysEarnings = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch the driver using the userId
    const driver = await Driver.findOne({ userId: userId });

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Get today's start and end timestamps
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Perform the aggregation to calculate today's earnings
    const result = await RideDetails.aggregate([
      {
        $match: {
          driverId: new mongoose.Types.ObjectId(driver._id),
          ride_end_time: { $gte: todayStart, $lte: todayEnd },
        },
      },
      {
        $group: {
          _id: null, // No grouping by field; just sum the total
          totalEarnings: { $sum: "$driver_profit" },
        },
      },
    ]);

    let totalEarnings = result.length > 0 ? result[0].totalEarnings : 0;
    totalEarnings = Math.ceil(totalEarnings);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { totalEarnings },
          "Today's earnings fetched successfully"
        )
      );
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch today's earnings"));
  }
});

// Get Total Earings by date
export const getTotalEarningByDate = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { fromDate, toDate } = req.body;

  try {
    // Validate the dates
    if (!fromDate || !toDate) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Both fromDate and toDate are required")
        );
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);

    // Adjust `end` to include the entire end date
    end.setHours(23, 59, 59, 999);

    // Fetch the driver
    const driver = await Driver.findById(userId);

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Perform the aggregation to calculate earnings
    const result = await RideDetails.aggregate([
      {
        $match: {
          driverId: new mongoose.Types.ObjectId(driver._id),
          ride_end_time: { $gte: start, $lte: end }, // Filter by date range
        },
      },
      {
        $group: {
          _id: null, // No grouping field; just sum all earnings
          totalEarnings: { $sum: "$driver_profit" },
        },
      },
    ]);

    let totalEarnings = result.length > 0 ? result[0].totalEarnings : 0;
    totalEarnings = Math.ceil(totalEarnings);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { totalEarnings },
          "Total earnings fetched successfully"
        )
      );
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch earnings by date"));
  }
});

// Get Recent rides
export const getRecentRides = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const rides = await RideDetails.find({
      driverId: new mongoose.Types.ObjectId(id),
    })
      .populate({
        path: "driverId",
        select: "name driver_photo", // Include driver's name and photo
      })
      .sort({ ride_end_time: -1 }) // Sort by most recent rides
      .limit(5); // Get the last 5 rides

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          rides,
          rides.length > 0
            ? "Last 5 Rides Fetched Successfully"
            : "No Rides Found"
        )
      );
  } catch (error) {
    console.error("Error retrieving recent rides:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to get recent rides"));
  }
});

// Get Due Wallet Balance and Total Earnings
export const getWalletBalance = asyncHandler(async (req, res) => {
  const { userId } = req.params; // Extract userId from request parameters

  try {
    // Find the driver by userId
    const driver = await Driver.findOne({ userId });

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Get the due_wallet and total_earning balance
    const dueWalletBalance = driver.due_wallet;
    const totalEarnings = driver.total_earning;

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { dueWalletBalance, totalEarnings },
          "Wallet details fetched successfully"
        )
      );
  } catch (error) {
    console.error("Error fetching wallet details:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch wallet details"));
  }
});

export const getTotalWithdrawalsByDate = asyncHandler(async (req, res) => {
  const { driverId, fromDate, toDate } = req.body;
  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    // Ensure `toDate` includes the entire day
    to.setHours(23, 59, 59, 999);

    console.log("From:", from);
    console.log("To:", to);
    console.log("driverId", driverId);

    const matchCondition =
      fromDate === toDate
        ? { withdrawalDate: { $eq: from } } // If same date, use $eq
        : {
            withdrawalDate: {
              $gte: from, // Greater than or equal to fromDate
              $lte: to, // Less than or equal to toDate
            },
          };

    const result = await WithdrawalLogs.aggregate([
      {
        $match: {
          driverId: new mongoose.Types.ObjectId(driverId),
          ...matchCondition,
        },
      },
      {
        $group: {
          _id: null,
          totalWithdrawals: { $sum: "$withdrawalAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalWithdrawals: 1,
        },
      },
    ]);

    const totalAmount = result.length > 0 ? result[0].totalWithdrawals : 0;
    console.log(`Total Withdrawals: ${result}`);

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Total Amount fetched"));
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to get recent rides"));
  }
});

export const createWithdrawalLogs = asyncHandler(async (req, res) => {
  try {
    const { driverId, withdrawalAmount, mode } = req.body;

    if (!driverId || !withdrawalAmount || !mode) {
      return res.status(400).json({
        success: false,
        message: "Driver ID, withdrawal amount, and mode are required.",
      });
    }

    // Validate mode
    const validModes = ["cash", "upi", "bank transfer"];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `Invalid withdrawal mode. Allowed values: ${validModes.join(", ")}.`,
      });
    }

    // Check if driver exists and has sufficient earnings
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    if (driver.total_earning < withdrawalAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient earnings for withdrawal.",
      });
    }

    // Prepare withdrawal data based on mode
    const withdrawalData = {
      driverId: new mongoose.Types.ObjectId(driverId),
      withdrawalAmount,
      withdrawalDate: getCurrentLocalDate(),
      withdrawalTime: getCurrTime(),
      withdrawalMode: mode,
    };

    console.log({ withdrawalData });

    if (mode === "upi") {
      withdrawalData.upiDetails = { upiId: "user@upi" }; // Example UPI ID
    } else if (mode === "bank transfer") {
      withdrawalData.bankDetails = {
        accountNumber: "123456789",
        bankName: "Bank of Example",
        ifscCode: "IFSC1234",
      };
    }

    // Update driver's total earnings
    await Driver.findByIdAndUpdate(
      driverId,
      { $inc: { total_earning: -withdrawalAmount } },
      { new: true }
    );

    // Save withdrawal log
    const newWithdrawal = new WithdrawalLogs(withdrawalData);
    await newWithdrawal.save();

    return res.status(201).json({
      success: true,
      message: "Withdrawal log created successfully",
      data: newWithdrawal,
    });
  } catch (error) {
    console.error("Error creating withdrawal log:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create withdrawal log",
      error: error.message,
    });
  }
});

// Get Top Drivers Based on Number of Rides with ETO Card Details
export const getTopDrivers = asyncHandler(async (req, res) => {
  try {
    const topDrivers = await RideDetails.aggregate([
      {
        $group: {
          _id: "$driverId",
          rideCount: { $sum: 1 }, // Count the number of rides for each driver
        },
      },
      {
        $lookup: {
          from: "drivers", // Collection name for Driver
          localField: "_id",
          foreignField: "_id",
          as: "driverDetails",
        },
      },
      {
        $unwind: "$driverDetails", // Unwind the driver details to merge with the ride data
      },
      {
        $lookup: {
          from: "etocards", // Collection name for ETOCard
          localField: "_id",
          foreignField: "driverId",
          as: "etoCardDetails",
        },
      },
      {
        $unwind: {
          path: "$etoCardDetails",
          preserveNullAndEmptyArrays: true, // Keep drivers even if they don't have an ETO card
        },
      },
      {
        $sort: { rideCount: -1 }, // Sort by ride count in descending order
      },
      {
        $limit: 10, // Limit to top 10 drivers
      },
      {
        $project: {
          _id: 0, // Exclude the aggregation `_id` field
          driverId: "$driverDetails._id", // Driver ID
          rideCount: 1, // Number of rides
          driverDetails: 1, // Include all fields from `driverDetails`
          etoCard: "$etoCardDetails", // Include ETO card details
        },
      },
    ]);

    if (topDrivers.length === 0) {
      return res.status(404).json(new ApiResponse(404, [], "No drivers found"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          topDrivers,
          "Top drivers fetched successfully with ETO card details"
        )
      );
  } catch (error) {
    console.error("Error fetching top drivers:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, [], "Failed to fetch top drivers"));
  }
});

// Get all drivers with isApproved = false
export const getUnapprovedDrivers = asyncHandler(async (req, res) => {
  try {
    const { adminId, franchiseId } = req.query;

    // Validate IDs
    if (adminId && !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json(
        new ApiResponse(400, null, "Invalid admin ID format")
      );
    }

    if (franchiseId && !mongoose.Types.ObjectId.isValid(franchiseId)) {
      return res.status(400).json(
        new ApiResponse(400, null, "Invalid franchise ID format")
      );
    }

    // Build query object
    const query = { isApproved: false };

    // Apply franchise filter if franchiseId is provided
    if (franchiseId) {
      // Only show drivers assigned to this specific franchise
      query.franchiseId = franchiseId;
      
      // Optionally verify franchise exists
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res.status(404).json(
          new ApiResponse(404, null, "Franchise not found")
        );
      }
    } else if (adminId) {
      // Admin can see all unapproved drivers (both with and without franchise)
      // No franchise filter applied
      
      // Optionally verify admin exists
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json(
          new ApiResponse(404, null, "Admin not found")
        );
      }
    } else {
      // If neither adminId nor franchiseId is provided, return error
      return res.status(400).json(
        new ApiResponse(400, null, "Either adminId or franchiseId is required")
      );
    }

    // Find unapproved drivers with optional population
    const unapprovedDrivers = await Driver.find(query)
      .populate({
        path: 'franchiseId',
        select: 'name email phone'
      })
      .sort({ createdAt: -1 }); // Sort by newest first

    if (unapprovedDrivers.length === 0) {
      const message = franchiseId 
        ? "No unapproved drivers found for this franchise"
        : "No unapproved drivers found";
      
      return res.status(200).json(
        new ApiResponse(200, { drivers: [], count: 0 }, message)
      );
    }

    // Format response data
    const formattedDrivers = unapprovedDrivers.map(driver => ({
      _id: driver._id,
      userId: driver.userId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      license_number: driver.license_number,
      pin_code: driver.pin_code,
      car_photo: driver.car_photo,
      village: driver.village,
      police_station: driver.police_station,
      landmark: driver.landmark,
      post_office: driver.post_office,
      district: driver.district,
      driver_photo: driver.driver_photo,
      aadhar_front_photo: driver.aadhar_front_photo,
      aadhar_back_photo: driver.aadhar_back_photo,
      
      isActive: driver.isActive,
      createdAt: driver.createdAt,
      franchise: driver.franchiseId ? {
        _id: driver.franchiseId._id,
        name: driver.franchiseId.name,
        email: driver.franchiseId.email,
        phone: driver.franchiseId.phone
      } : null,
      rejectionReason: driver.rejectionReason || ''
    }));

    // Determine response message
    let message = "Unapproved drivers fetched successfully";
    if (franchiseId && unapprovedDrivers[0]?.franchiseId) {
      message = `Unapproved drivers for franchise "${unapprovedDrivers[0].franchiseId.name}" fetched successfully`;
    } else if (adminId) {
      message = "All unapproved drivers fetched (Admin view)";
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          drivers: formattedDrivers,
          count: unapprovedDrivers.length,
          filters: {
            franchiseId: franchiseId || null,
            adminId: adminId || null
          }
        },
        message
      )
    );
  } catch (error) {
    console.error("Error fetching unapproved drivers:", error.message);
    return res.status(500).json(
      new ApiResponse(500, null, "Failed to fetch unapproved drivers")
    );
  }
});

// Get all rejected drivers (with admin/franchise access control)
export const getRejectedDrivers = asyncHandler(async (req, res) => {
  try {
    const { adminId, franchiseId } = req.query;

    // Validate IDs
    if (adminId && !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json(
        new ApiResponse(400, null, "Invalid admin ID format")
      );
    }

    if (franchiseId && !mongoose.Types.ObjectId.isValid(franchiseId)) {
      return res.status(400).json(
        new ApiResponse(400, null, "Invalid franchise ID format")
      );
    }

    // Build query object for rejected drivers
    const query = {
      isApproved: false,
      rejectionReason: { $exists: true, $ne: "" }
    };

    // Apply franchise filter if franchiseId is provided
    if (franchiseId) {
      // Only show rejected drivers assigned to this specific franchise
      query.franchiseId = franchiseId;
      
      // Optionally verify franchise exists
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res.status(404).json(
          new ApiResponse(404, null, "Franchise not found")
        );
      }
    } else if (adminId) {
      // Admin can see all rejected drivers (both with and without franchise)
      // No franchise filter applied
      
      // Optionally verify admin exists
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json(
          new ApiResponse(404, null, "Admin not found")
        );
      }
    } else {
      // If neither adminId nor franchiseId is provided, return error
      return res.status(400).json(
        new ApiResponse(400, null, "Either adminId or franchiseId is required")
      );
    }

    // Find rejected drivers with optional population
    const rejectedDrivers = await Driver.find(query)
      .populate({
        path: 'franchiseId',
        select: 'name email phone'
      })
      .sort({ rejectedAt: -1 }); // Sort by rejection date (newest first)

    if (rejectedDrivers.length === 0) {
      const message = franchiseId 
        ? "No rejected drivers found for this franchise"
        : "No rejected drivers found";
      
      return res.status(200).json(
        new ApiResponse(200, { drivers: [], count: 0 }, message)
      );
    }

    // Format response data
    const formattedDrivers = rejectedDrivers.map(driver => ({
      _id: driver._id,
      userId: driver.userId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      license_number: driver.license_number,
      pin_code: driver.pin_code,
      isActive: driver.isActive,
      isApproved: driver.isApproved,
      createdAt: driver.createdAt,
      franchise: driver.franchiseId ? {
        _id: driver.franchiseId._id,
        name: driver.franchiseId.name,
        email: driver.franchiseId.email,
        phone: driver.franchiseId.phone
      } : null,
      rejectionReason: driver.rejectionReason || '',
      rejectedBy: driver.rejectedBy || '',
      rejectedById: driver.rejectedById || null,
      rejectedAt: driver.rejectedAt || null
    }));

    // Determine response message
    let message = "Rejected drivers fetched successfully";
    if (franchiseId && rejectedDrivers[0]?.franchiseId) {
      message = `Rejected drivers for franchise "${rejectedDrivers[0].franchiseId.name}" fetched successfully`;
    } else if (adminId) {
      message = "All rejected drivers fetched (Admin view)";
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          drivers: formattedDrivers,
          count: rejectedDrivers.length,
          filters: {
            franchiseId: franchiseId || null,
            adminId: adminId || null
          }
        },
        message
      )
    );
  } catch (error) {
    console.error("Error fetching rejected drivers:", error.message);
    return res.status(500).json(
      new ApiResponse(500, null, "Failed to fetch rejected drivers")
    );
  }
});

// Get total number of approved drivers
export const getApprovedDrivers = asyncHandler(async (req, res) => {
  try {
    // Count drivers where isApproved is true
    const approvedDriversCount = await Driver.approvedDriversCount({
      isApproved: true,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          drivers: approvedDriversCount,
          count: approvedDriversCount.length, // Send the length of unapproved drivers
        },
        "Approved drivers count fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching approved drivers count:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to fetch approved drivers count")
      );
  }
});

// Get the approval status of a driver by userId
export const getApprovedStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    // Find the driver by userId
    const driver = await Driver.findOne({ userId });

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Send the isApproved status
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          isApproved: driver.isApproved,
        },
        "Driver approval status fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching driver approval status:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to fetch driver approval status")
      );
  }
});

// Approve Driver Function - Updated for commission and fare settings
export const approveDriverByDriverId = asyncHandler(async (req, res) => {
  const { driverId, franchiseId, adminId } = req.body;

  if (!driverId) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Driver ID is required"));
  }

  // Check if either franchiseId OR adminId is provided
  if (!franchiseId && !adminId) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Either franchiseId OR adminId is required")
      );
  }

  try {
    // Get driver with franchise info
    const driver = await Driver.findById(driverId).populate(
      "franchiseId",
      "name userId isApproved isActive"
    );
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Check if driver is already approved
    if (driver.isApproved) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Driver is already approved"));
    }

    // Check driver's required fields
    if (!driver.pin_code || !driver.name || !driver.license_number) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Driver must complete profile (pincode, name, license) before approval"
          )
        );
    }

    let approvalMessage = "";
    let approvedByType = "";
    let shouldUpdateFranchiseCount = false;
    let approverAdminId = null; // The admin who is approving

    // Case 1: Approval using franchiseId
    if (franchiseId) {
      // Check if driver has this franchise assigned
      if (
        !driver.franchiseId ||
        driver.franchiseId._id.toString() !== franchiseId.toString()
      ) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              "This driver is not assigned to your franchise"
            )
          );
      }

      const franchise = driver.franchiseId;

      // Check if franchise is approved and active
      if (!franchise.isApproved || !franchise.isActive) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Cannot approve driver. Franchise is not approved or active."
            )
          );
      }

      // Verify franchise exists
      const franchiseDoc = await Franchise.findById(franchiseId);
      if (!franchiseDoc) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      // Franchise is approving, but we need an admin ID for Khata
      // Get admin ID from request or find a default admin
      if (!adminId) {
        // Try to find any admin to use as adminId in Khata
        const anyAdmin = await Admin.findOne({});
        if (!anyAdmin) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                "No admin found. Please provide adminId for Khata."
              )
            );
        }
        approverAdminId = anyAdmin._id;
      } else {
        approverAdminId = adminId;
      }

      approvalMessage = `Driver approved by franchise: ${franchise.name}`;
      approvedByType = "franchise";
      shouldUpdateFranchiseCount = true;
    }
    // Case 2: Approval using adminId only
    else if (adminId) {
      // Check if admin exists
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      approverAdminId = adminId;
      approvalMessage = "Driver approved by admin";
      approvedByType = "admin";

      // If driver has franchise, update franchise count
      if (driver.franchiseId) {
        shouldUpdateFranchiseCount = true;
      }
    }

    // STEP 1: Check if FranchiseCommissionSettings exists
    let franchiseCommissionSettings = null;
    let adminCommissionRate = 18; // Default admin commission
    let franchiseCommissionRate = 0;

    if (driver.franchiseId) {
      franchiseCommissionSettings = await FranchiseCommissionSettings.findOne({
        franchiseId: driver.franchiseId._id,
        isActive: true,
      });

      if (franchiseCommissionSettings) {
        adminCommissionRate = franchiseCommissionSettings.admin_commission_rate;
        franchiseCommissionRate =
          franchiseCommissionSettings.franchise_commission_rate;
      } else {
        // Create default commission settings if not exists
        franchiseCommissionSettings = new FranchiseCommissionSettings({
          franchiseId: driver.franchiseId._id,
          admin_commission_rate: 18,
          franchise_commission_rate: 10,
          last_changed_by: approverAdminId,
        });

        // Add initial history entries
        franchiseCommissionSettings.settings_history.push({
          setting_type: "admin_commission",
          field_name: "admin_commission_rate",
          old_value: 0,
          new_value: 18,
          changed_by: approverAdminId,
          changed_at: new Date(),
          reason: "Initial commission settings created",
        });

        franchiseCommissionSettings.settings_history.push({
          setting_type: "franchise_commission",
          field_name: "franchise_commission_rate",
          old_value: 0,
          new_value: 10,
          changed_by: approverAdminId,
          changed_at: new Date(),
          reason: "Initial commission settings created",
        });

        await franchiseCommissionSettings.save();
        console.log(
          `Created commission settings for franchise: ${driver.franchiseId.name}`
        );
      }
    }

    // STEP 2: Check if Khata entry already exists
    const existingKhata = await Khata.findOne({ driverId });
    if (!existingKhata && approverAdminId) {
      // Create Khata entry with proper commission rates
      const khataData = {
        driverId,
        adminId: approverAdminId,
        franchiseId: driver.franchiseId ? driver.franchiseId._id : null,
        driverdue: 0,
        admindue: 0,
        franchisedue: 0,
      };

      console.log("Creating Khata with data:", khataData);
      const newKhata = await Khata.create(khataData);

      // Add initial due payment details for record keeping
      newKhata.due_payment_details.push({
        driverId,
        rideId: null, // No ride yet
        total_price: 0,
        admin_profit: 0,
        franchise_profit: 0,
        driver_profit: 0,
        payment_mode: null,
        createdAt: new Date(),
        reason: "Initial Khata entry created during driver approval",
      });

      await newKhata.save();
    }

    // STEP 3: Generate ETO card if not exists
    const existingEtoCard = await ETOCard.findOne({ driverId });
    if (!existingEtoCard) {
      let eto_id_num;
      let isUnique = false;
      while (!isUnique) {
        eto_id_num = generateRandom3DigitNumber();
        const existingEto = await ETOCard.findOne({
          eto_id_num: `ETO ${eto_id_num}`,
        });
        if (!existingEto) {
          isUnique = true;
        }
      }

      const etoCardData = {
        driverId,
        userId: driver.userId,
        eto_id_num: `ETO ${eto_id_num}`,
        id_details: {
          name: driver.name,
          email: driver.email,
          village: driver.village,
          police_station: driver.police_station,
          landmark: driver.landmark,
          post_office: driver.post_office,
          district: driver.district,
          pin_code: driver.pin_code,
          driver_photo: driver.driver_photo,
          car_photo: driver.car_photo,
        },
        helpLine_num: driver.helpLine_num || "",
      };

      await ETOCard.create(etoCardData);
    }

    // STEP 4: Update driver status
    driver.isApproved = true;
    driver.isActive = true;
    await driver.save();

    // STEP 5: Update franchise total_drivers count if needed
    if (shouldUpdateFranchiseCount && driver.franchiseId) {
      const approvedDriverCount = await Driver.countDocuments({
        franchiseId: driver.franchiseId._id,
        isApproved: true,
      });

      await Franchise.findByIdAndUpdate(driver.franchiseId._id, {
        total_drivers: approvedDriverCount,
      });
    }

    // STEP 6: Prepare response with commission settings
    const responseData = {
      driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        isApproved: driver.isApproved,
        isActive: driver.isActive,
        franchiseId: driver.franchiseId ? driver.franchiseId._id : null,
        franchiseName: driver.franchiseId ? driver.franchiseId.name : null,
      },
      commissionSettings: franchiseCommissionSettings
        ? {
            adminCommissionRate:
              franchiseCommissionSettings.admin_commission_rate,
            franchiseCommissionRate:
              franchiseCommissionSettings.franchise_commission_rate,
          }
        : {
            adminCommissionRate: 18, // Default for non-franchise
            franchiseCommissionRate: 0,
          },
      khataInfo: {
        hasKhata: !!(await Khata.findOne({ driverId })),
        adminId: approverAdminId,
        franchiseId: driver.franchiseId ? driver.franchiseId._id : null,
      },
      approvedBy: approvedByType,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          `${approvalMessage}. ${
            driver.franchiseId
              ? `Commission rates set: Admin ${franchiseCommissionSettings?.admin_commission_rate || 18}%, Franchise ${franchiseCommissionSettings?.franchise_commission_rate || 10}%`
              : "Default commission rate: Admin 18%"
          }`
        )
      );
  } catch (error) {
    console.error("Error approving driver:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to approve driver"));
  }
});

// Reject Driver Function
export const rejectDriverByDriverId = asyncHandler(async (req, res) => {
  const { driverId, rejectionReason, franchiseId, adminId } = req.body;

  if (!driverId || !rejectionReason) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Driver ID and rejection reason are required"
        )
      );
  }

  try {
    // Get driver with franchise info
    const driver = await Driver.findById(driverId).populate(
      "franchiseId",
      "name userId isApproved isActive"
    );

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Check if driver is already approved (can't reject approved driver)
    if (driver.isApproved) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Cannot reject an approved driver. Please deactivate instead."
          )
        );
    }

    // Check authorization for franchise rejection
    if (franchiseId) {
      // Check if driver has this franchise assigned
      if (
        !driver.franchiseId ||
        driver.franchiseId._id.toString() !== franchiseId.toString()
      ) {
        return res
          .status(403)
          .json(
            new ApiResponse(
              403,
              null,
              "You can only reject drivers assigned to your franchise"
            )
          );
      }

      // Check if franchise is approved and active
      if (!driver.franchiseId.isApproved || !driver.franchiseId.isActive) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Cannot reject driver. Franchise is not approved or active."
            )
          );
      }
    }

    // Update driver with rejection details
    driver.isApproved = false;
    driver.isActive = false;
    driver.rejectionReason = rejectionReason;
    driver.rejectedBy = franchiseId
      ? "franchise"
      : adminId
        ? "admin"
        : "system";
    driver.rejectedById = franchiseId || adminId || null;
    driver.rejectedAt = new Date();

    await driver.save();

    // Update franchise total_drivers count if driver has franchise
    // (in case driver was previously approved and now being rejected)
    if (driver.franchiseId) {
      const approvedDriverCount = await Driver.countDocuments({
        franchiseId: driver.franchiseId._id,
        isApproved: true,
      });

      await Franchise.findByIdAndUpdate(driver.franchiseId._id, {
        total_drivers: approvedDriverCount,
      });
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          driver: {
            _id: driver._id,
            name: driver.name,
            phone: driver.phone,
            isApproved: driver.isApproved,
            isActive: driver.isActive,
            rejectionReason: driver.rejectionReason,
            rejectedBy: driver.rejectedBy,
            rejectedAt: driver.rejectedAt,
            franchiseId: driver.franchiseId ? driver.franchiseId._id : null,
          },
          franchiseAssigned: !!driver.franchiseId,
          franchiseName: driver.franchiseId ? driver.franchiseId.name : null,
        },
        "Driver rejected successfully"
      )
    );
  } catch (error) {
    console.error("Error rejecting driver:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to reject driver"));
  }
});

// Delete Driver, User, and ETOCard
export const deleteDriverAccount = asyncHandler(async (req, res) => {
  const { driverId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid driver ID"));
  }

  try {
    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Get the associated userId
    const userId = driver.userId;

    // Delete ETOCard
    await ETOCard.findOneAndDelete({ driverId });

    // Delete Driver
    await Driver.findByIdAndDelete(driverId);

    // Delete User
    await User.findByIdAndDelete(userId);

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Account deleted successfully"));
  } catch (error) {
    console.error("Error deleting driver account:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to delete driver account"));
  }
});

// Update OneSignal Player ID for Driver
export const updateOneSignalPlayerId = asyncHandler(async (req, res) => {
  const { driverId, oneSignalPlayerId } = req.body;

  console.log("Updating OneSignal Player ID for Driver:", {
    driverId,
    oneSignalPlayerId,
  });

  if (!driverId || !oneSignalPlayerId) {
    return res.status(400).json({
      success: false,
      message: "Driver ID and OneSignal Player ID are required.",
    });
  }

  try {
    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { oneSignalPlayerId },
      { new: true }
    );

    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found." });
    }

    return res.status(200).json({
      success: true,
      message: "OneSignal Player ID updated successfully.",
      driver,
    });
  } catch (error) {
    console.error("Error updating OneSignal Player ID:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update OneSignal Player ID.",
    });
  }
});
