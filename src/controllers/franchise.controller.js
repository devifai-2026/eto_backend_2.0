import { asyncHandler } from "../utils/asyncHandler.js";
import { Franchise } from "../models/franchise.model.js";
import { User } from "../models/user.model.js";
import { Driver } from "../models/driver.model.js";
import { Admin } from "../models/admin.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import mongoose from "mongoose";
import { FranchiseCommissionSettings } from "../models/commissionSettings.model.js";
import { Khata } from "../models/khata.model.js";
import { RideDetails } from "../models/rideDetails.model.js";

// Create Franchise Function
export const createFranchise = asyncHandler(async (req, res) => {
  const { name, email, phone, address, bank_details, documents, description } =
    req.body;

  // Required fields validation
  if (!name || !email || !phone || !address || !bank_details || !documents) {
    return res.status(400).json(
      new ApiResponse(400, null, "Missing required fields", {
        required: [
          "name",
          "email",
          "phone",
          "address",
          "bank_details",
          "documents",
        ],
      })
    );
  }

  try {
    // Check if phone number already exists in User model
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Phone number already registered"));
    }

    // Check if franchise with same email or phone exists
    const existingFranchise = await Franchise.findOne({
      $or: [{ email }, { phone }],
    });
    if (existingFranchise) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Franchise with this email or phone already exists"
          )
        );
    }

    // Find admin who is creating the franchise
    const admin = await Admin.findOne();
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Create User for franchise with isFranchise = true
    const user = new User({
      phone,
      isVerified: true,
      isDriver: false,
      isAdmin: false,
      isFranchise: true, // Add this field to distinguish franchise users
    });
    await user.save();

    // Prepare franchise data
    const franchiseData = {
      name,
      email,
      phone,
      address,
      bank_details,
      documents,
      description,
      createdBy: admin._id,
      userId: user._id,
      // accessible_pincodes: [
      //   {
      //     pincode: address.pincode,
      //     city: address.city,
      //     district: address.district,
      //     state: address.state,
      //     addedBy: adminId,
      //     isActive: true,
      //   },
      // ],
    };

    // Create franchise
    const franchise = new Franchise(franchiseData);
    await franchise.save();

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { franchise, user },
          "Franchise created successfully"
        )
      );
  } catch (error) {
    console.error("Error creating franchise:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create franchise"));
  }
});

// Upload Franchise Documents Function
export const uploadFranchiseDocuments = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    // Debug: Log what files are received
    console.log("Files received:", req.files);
    console.log("File fields:", Object.keys(req.files || {}));

    const franchise = await Franchise.findById(id);

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    const updateData = { documents: {} };
    const uploadedFiles = [];

    // Check if files exist
    if (!req.files) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "No files uploaded"));
    }

    // Handle identity documents (multiple files)
    if (req.files["identity_documents"]) {
      const identityDocs = req.files["identity_documents"].map(
        (file) => file.path
      );
      updateData.documents.identity_documents = identityDocs;

      identityDocs.forEach((path) => {
        uploadedFiles.push({
          type: "identity_document",
          path: path,
        });
      });
    }

    // Handle trade license (single file)
    if (req.files["trade_license"] && req.files["trade_license"].length > 0) {
      updateData.documents.trade_license = req.files["trade_license"][0].path;
      uploadedFiles.push({
        type: "trade_license",
        path: req.files["trade_license"][0].path,
      });
    }

    // Check if both required documents are uploaded
    if (
      !updateData.documents.identity_documents ||
      updateData.documents.identity_documents.length === 0 ||
      !updateData.documents.trade_license
    ) {
      const missingDocs = [];
      if (
        !updateData.documents.identity_documents ||
        updateData.documents.identity_documents.length === 0
      ) {
        missingDocs.push("identity_documents (at least one)");
      }
      if (!updateData.documents.trade_license) {
        missingDocs.push("trade_license");
      }

      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Missing required documents: ${missingDocs.join(", ")}`
          )
        );
    }

    // Update franchise with document paths
    const updatedFranchise = await Franchise.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: updatedFranchise,
          uploadedFiles,
          message: "Documents uploaded successfully",
        },
        "Documents uploaded successfully"
      )
    );
  } catch (error) {
    console.error("Error uploading franchise documents:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to upload documents"));
  }
});

// Get All Franchises Function
export const getAllFranchises = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status = "" } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    let query = {};

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status) {
      if (status === "active") {
        query.isActive = true;
        query.isApproved = true;
      } else if (status === "inactive") {
        query.isActive = false;
        query.isApproved = true;
      } else if (status === "pending") {
        query.isApproved = false;
      }
    }

    // Get total count
    const totalFranchises = await Franchise.countDocuments(query);

    // Get paginated franchises
    const franchises = await Franchise.find(query)
      .select(
        "name email phone address isActive isApproved total_drivers total_earnings createdAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Get detailed statistics using aggregation for the filtered franchises
    const franchiseIds = franchises.map((f) => f._id);

    const statsAggregation = await Driver.aggregate([
      {
        $match: {
          franchiseId: { $in: franchiseIds },
        },
      },
      {
        $group: {
          _id: "$franchiseId",
          total_completed_rides: { $sum: "$total_complete_rides" },
          driver_count: { $sum: 1 },
        },
      },
    ]);

    // Convert stats to map for easy lookup
    const franchiseStatsMap = new Map();
    statsAggregation.forEach((stat) => {
      franchiseStatsMap.set(stat._id.toString(), {
        total_completed_rides: stat.total_completed_rides || 0,
        driver_count: stat.driver_count || 0,
      });
    });

    // Get franchise commission settings for admin earnings calculation
    const commissionSettings = await FranchiseCommissionSettings.find({
      franchiseId: { $in: franchiseIds },
    }).select("franchiseId admin_commission_rate");

    const commissionMap = new Map();
    commissionSettings.forEach((setting) => {
      commissionMap.set(
        setting.franchiseId.toString(),
        setting.admin_commission_rate || 18
      );
    });

    // Enhanced franchises with additional data
    const enhancedFranchises = franchises.map((franchise) => {
      const franchiseIdStr = franchise._id.toString();
      const stats = franchiseStatsMap.get(franchiseIdStr) || {
        total_completed_rides: 0,
        driver_count: 0,
      };

      const commissionRate = commissionMap.get(franchiseIdStr) || 18;
      const adminEarnings =
        (franchise.total_earnings || 0) * (commissionRate / 100);

      return {
        _id: franchise._id,
        name: franchise.name,
        email: franchise.email,
        phone: franchise.phone,
        address: {
          city: franchise.address?.city || "",
          state: franchise.address?.state || "",
          district: franchise.address?.district || "",
          pincode: franchise.address?.pincode || "",
        },
        isActive: franchise.isActive,
        isApproved: franchise.isApproved,
        total_drivers: franchise.total_drivers || 0,
        total_completed_rides: stats.total_completed_rides,
        franchise_earnings: franchise.total_earnings || 0,
        admin_earnings: adminEarnings,
        createdAt: franchise.createdAt,
      };
    });

    // Calculate summary statistics (for all franchises, not just paginated ones)
    const allFranchisesForSummary = await Franchise.find({});
    const summary = {
      total_franchises: allFranchisesForSummary.length,
      active_franchises: allFranchisesForSummary.filter(
        (f) => f.isActive && f.isApproved
      ).length,
      approved_franchises: allFranchisesForSummary.filter((f) => f.isApproved)
        .length,
      total_drivers: await Driver.countDocuments({
        franchiseId: { $ne: null },
      }),
      total_completed_rides: await Driver.aggregate([
        { $match: { franchiseId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: "$total_complete_rides" } } },
      ]).then((result) => result[0]?.total || 0),
      total_franchise_earnings: allFranchisesForSummary.reduce(
        (sum, f) => sum + (f.total_earnings || 0),
        0
      ),
      total_admin_earnings: allFranchisesForSummary.reduce((sum, f) => {
        const earnings = f.total_earnings || 0;
        return sum + earnings * 0.18; // Assuming 18% commission
      }, 0),
    };

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          summary,
          franchises: enhancedFranchises,
          pagination: {
            total: totalFranchises,
            page: pageNumber,
            limit: limitNumber,
            pages: Math.ceil(totalFranchises / limitNumber),
            hasNextPage: pageNumber < Math.ceil(totalFranchises / limitNumber),
            hasPrevPage: pageNumber > 1,
          },
        },
        "Franchises retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error retrieving franchises:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve franchises"));
  }
});

// Get Franchise by ID Function
export const getFranchiseById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    let franchise;

    // Handle "me" parameter for current franchise user
    if (id === "me") {
      franchise = await Franchise.findOne({ userId: req.user._id });
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise profile not found"));
      }
    } else {
      franchise = await Franchise.findById(id);
    }

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Check permissions
    const isAdmin = req.user.isAdmin;
    const isOwnFranchise =
      franchise.userId.toString() === req.user._id.toString();

    if (!isAdmin && !isOwnFranchise) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "Access denied. You don't have permission to access this franchise"
          )
        );
    }

    // Populate fields
    await franchise.populate("createdBy", "name email");
    await franchise.populate("userId", "phone isVerified");
    await franchise.populate("accessible_pincodes.addedBy", "name");

    // Convert file paths to full URLs for documents
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Convert franchise to plain object
    const franchiseObj = franchise.toObject();

    // Process identity documents
    if (franchiseObj.documents?.identity_documents) {
      franchiseObj.documents.identity_documents =
        franchiseObj.documents.identity_documents.map((doc) => {
          // Check if already a full URL
          if (doc.startsWith("http")) return doc;

          // Extract filename from path
          const filename = doc.split(/[\\\/]/).pop();
          return `${baseUrl}/franchise-documents/${filename}`;
        });
    }

    // Process trade license
    if (franchiseObj.documents?.trade_license) {
      if (!franchiseObj.documents.trade_license.startsWith("http")) {
        const filename = franchiseObj.documents.trade_license
          .split(/[\\\/]/)
          .pop();
        franchiseObj.documents.trade_license = `${baseUrl}/franchise-documents/${filename}`;
      }
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: franchiseObj,
        },
        "Franchise retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error retrieving franchise:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve franchise"));
  }
});

// Update Franchise Function
export const updateFranchise = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  // Prevent updating sensitive fields
  delete updateData.userId;
  delete updateData.createdBy;
  delete updateData.phone;
  delete updateData.email;
  delete updateData.accessible_pincodes;

  try {
    const franchise = await Franchise.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, franchise, "Franchise updated successfully"));
  } catch (error) {
    console.error("Error updating franchise:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update franchise"));
  }
});

// Delete Franchise Function
export const deleteFranchise = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    const franchise = await Franchise.findById(id);

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Check if franchise has any drivers
    const driverCount = await Driver.countDocuments({ franchiseId: id });
    if (driverCount > 0) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Cannot delete franchise with assigned drivers. Please reassign or remove drivers first."
          )
        );
    }

    // Delete associated user
    await User.findByIdAndDelete(franchise.userId);

    // Delete franchise
    await Franchise.findByIdAndDelete(id);

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Franchise deleted successfully"));
  } catch (error) {
    console.error("Error deleting franchise:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to delete franchise"));
  }
});

// Get Drivers under Franchise
export const getFranchiseDrivers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    page = 1,
    limit = 10,
    isActive,
    isApproved,
    status = "all", // "all", "active", "inactive", "pending", "onRide"
    search = "",
  } = req.query;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    const franchise = await Franchise.findById(id);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Build query
    const query = { franchiseId: id };

    // Handle status filter
    if (status !== "all") {
      if (status === "active") {
        query.isActive = true;
        query.isApproved = true;
      } else if (status === "inactive") {
        query.isActive = false;
        query.isApproved = true;
      } else if (status === "pending") {
        query.isApproved = false;
      } else if (status === "onRide") {
        query.is_on_ride = true;
      }
    } else {
      // If using old parameters for backward compatibility
      if (isActive !== undefined) query.isActive = isActive === "true";
      if (isApproved !== undefined) query.isApproved = isApproved === "true";
    }

    // Search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
      ];
    }

    const skip = (page - 1) * limit;

    // Get drivers with pagination
    const drivers = await Driver.find(query)
      .select(
        "name phone email isActive isApproved total_complete_rides total_earning current_location is_on_ride current_ride_id userId login_time logout_time createdAt"
      )
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const totalDrivers = await Driver.countDocuments(query);

    // Get current ride details for drivers who are on ride
    const driversOnRide = drivers.filter(
      (d) => d.is_on_ride && d.current_ride_id
    );
    const rideIds = driversOnRide.map((d) => d.current_ride_id);

    let currentRides = [];
    if (rideIds.length > 0) {
      currentRides = await RideDetails.find({
        _id: { $in: rideIds },
        isRide_ended: false,
        isCancel_time: false,
      })
        .select(
          "pickup_location drop_location total_amount total_km started_time pickup_otp drop_otp payment_mode riderId"
        )
        .populate("riderId", "name phone");
    }

    // Create a map of ride details by ride ID for quick lookup
    const rideMap = {};
    currentRides.forEach((ride) => {
      rideMap[ride._id.toString()] = {
        rideId: ride._id,
        pickup_location: ride.pickup_location,
        drop_location: ride.drop_location,
        total_amount: ride.total_amount,
        total_km: ride.total_km,
        started_time: ride.started_time,
        pickup_otp: ride.pickup_otp,
        drop_otp: ride.drop_otp,
        payment_mode: ride.payment_mode,
        rider: ride.riderId
          ? {
              name: ride.riderId.name,
              phone: ride.riderId.phone,
            }
          : null,
      };
    });

    // Enhanced drivers with current ride info
    const enhancedDrivers = drivers.map((driver) => {
      const driverObj = driver.toObject();

      if (driver.is_on_ride && driver.current_ride_id) {
        const rideIdStr = driver.current_ride_id.toString();
        driverObj.current_ride = rideMap[rideIdStr] || null;
      } else {
        driverObj.current_ride = null;
      }

      // Format current location
      if (
        driverObj.current_location &&
        driverObj.current_location.coordinates
      ) {
        const [longitude, latitude] = driverObj.current_location.coordinates;
        driverObj.formatted_location = {
          latitude,
          longitude,
          url: `https://maps.google.com/?q=${latitude},${longitude}`,
        };
      }

      return driverObj;
    });

    // Calculate comprehensive statistics for ALL drivers in franchise (not filtered)
    const allDriversQuery = { franchiseId: id };

    const totalDriversAll = await Driver.countDocuments(allDriversQuery);
    const totalActiveDrivers = await Driver.countDocuments({
      ...allDriversQuery,
      isActive: true,
      is_on_ride: false,
    });

    const totalDriversOnRide = await Driver.countDocuments({
      ...allDriversQuery,
      is_on_ride: true,
    });

    const totalPendingDrivers = await Driver.countDocuments({
      ...allDriversQuery,
      isApproved: false,
    });

    // Get commission settings for this franchise
    const commissionSettings = await FranchiseCommissionSettings.findOne({
      franchiseId: id,
      isActive: true,
    });

    const adminCommissionRate = commissionSettings?.admin_commission_rate || 18;
    const franchiseCommissionRate =
      commissionSettings?.franchise_commission_rate || 10;

    // Calculate earnings from completed rides for this franchise
    const earningsAggregation = await RideDetails.aggregate([
      {
        $match: {
          franchiseId: new mongoose.Types.ObjectId(id),
          isRide_ended: true,
          isCancel_time: false,
        },
      },
      {
        $group: {
          _id: null,
          total_rides: { $sum: 1 },
          total_earnings: { $sum: "$total_amount" },
          total_admin_earnings: {
            $sum: {
              $multiply: ["$total_amount", adminCommissionRate / 100],
            },
          },
          total_franchise_earnings: {
            $sum: {
              $multiply: ["$total_amount", franchiseCommissionRate / 100],
            },
          },
          total_driver_earnings: {
            $sum: {
              $subtract: [
                "$total_amount",
                {
                  $add: [
                    { $multiply: ["$total_amount", adminCommissionRate / 100] },
                    {
                      $multiply: [
                        "$total_amount",
                        franchiseCommissionRate / 100,
                      ],
                    },
                  ],
                },
              ],
            },
          },
          total_distance: { $sum: "$total_km" },
        },
      },
    ]);

    // Calculate khata (dues) information
    const khataAggregation = await Khata.aggregate([
      {
        $match: {
          franchiseId: new mongoose.Types.ObjectId(id),
        },
      },
      {
        $group: {
          _id: null,
          total_driver_due: { $sum: "$driverdue" },
          total_admin_due: { $sum: "$admindue" },
          total_franchise_due: { $sum: "$franchisedue" },
        },
      },
    ]);

    // Calculate driver wallet balances
    const walletAggregation = await Driver.aggregate([
      {
        $match: {
          franchiseId: new mongoose.Types.ObjectId(id),
        },
      },
      {
        $group: {
          _id: null,
          total_cash_wallet: { $sum: "$cash_wallet" },
          total_online_wallet: { $sum: "$online_wallet" },
          total_due_wallet: { $sum: "$due_wallet" },
          avg_rating: { $avg: "$rating" },
        },
      },
    ]);

    // Get top performing drivers
    const topDrivers = await Driver.find({ franchiseId: id })
      .select("name total_complete_rides total_earning total_completed_km")
      .sort({ total_earning: -1 })
      .limit(5);

    // Prepare statistics
    const earningsData = earningsAggregation[0] || {
      total_rides: 0,
      total_earnings: 0,
      total_admin_earnings: 0,
      total_franchise_earnings: 0,
      total_driver_earnings: 0,
      total_distance: 0,
    };

    const khataData = khataAggregation[0] || {
      total_driver_due: 0,
      total_admin_due: 0,
      total_franchise_due: 0,
    };

    const walletData = walletAggregation[0] || {
      total_cash_wallet: 0,
      total_online_wallet: 0,
      total_due_wallet: 0,
      avg_rating: 0,
    };

    const summary = {
      // Basic counts
      total_drivers: totalDriversAll,
      total_active_drivers: totalActiveDrivers,
      total_drivers_on_ride: totalDriversOnRide,
      total_available_drivers: totalActiveDrivers - totalDriversOnRide,
      total_pending_drivers: totalPendingDrivers, // Pending count

      // Ride statistics
      total_completed_rides: earningsData.total_rides,
      total_distance_covered: earningsData.total_distance.toFixed(2),

      // Earnings statistics
      total_earnings: earningsData.total_earnings,
      total_admin_earnings: earningsData.total_admin_earnings,
      total_franchise_earnings: earningsData.total_franchise_earnings,
      total_driver_earnings: earningsData.total_driver_earnings,

      // Commission rates
      admin_commission_rate: adminCommissionRate,
      franchise_commission_rate: franchiseCommissionRate,

      // Wallet statistics
      total_cash_wallet: walletData.total_cash_wallet,
      total_online_wallet: walletData.total_online_wallet,
      total_due_wallet: walletData.total_due_wallet,
      total_wallet_balance:
        walletData.total_cash_wallet + walletData.total_online_wallet,

      // Khata (dues) statistics
      total_driver_due: khataData.total_driver_due,
      total_admin_due: khataData.total_admin_due,
      total_franchise_due: khataData.total_franchise_due,

      // Performance metrics
      avg_driver_rating: walletData.avg_rating
        ? walletData.avg_rating.toFixed(1)
        : 0,
      avg_rides_per_driver:
        totalDriversAll > 0
          ? (earningsData.total_rides / totalDriversAll).toFixed(2)
          : 0,
      avg_earnings_per_driver:
        totalDriversAll > 0
          ? (earningsData.total_driver_earnings / totalDriversAll).toFixed(2)
          : 0,
    };

    // Top drivers list
    const top_performers = topDrivers.map((driver) => ({
      name: driver.name,
      total_rides: driver.total_complete_rides,
      total_earnings: driver.total_earning,
      total_distance: driver.total_completed_km,
    }));

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          drivers: enhancedDrivers,
          summary,
          top_performers,
          commission_settings: {
            admin_rate: adminCommissionRate,
            franchise_rate: franchiseCommissionRate,
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalDrivers,
            pages: Math.ceil(totalDrivers / limit),
            hasNextPage: page < Math.ceil(totalDrivers / limit),
            hasPrevPage: page > 1,
          },
          franchise: {
            name: franchise.name,
            total_drivers: franchise.total_drivers,
            franchise_earnings: franchise.total_earnings || 0,
            address: franchise.address,
          },
          filters: {
            status,
            search,
          },
        },
        "Franchise drivers retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error retrieving franchise drivers:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve franchise drivers"));
  }
});

export const addPincodeAccess = asyncHandler(async (req, res) => {
  const { id } = req.params; // Franchise ID
  const { pincode } = req.body;
  const adminId = req.user?._id;

  if (!id || !pincode) {
    return res.status(400).json(
      new ApiResponse(400, null, "Missing required fields", {
        required: ["pincode"],
      })
    );
  }

  try {
    const franchise = await Franchise.findById(id);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // 1. Check if pincode already exists in this franchise's accessible_pincodes
    const existingPincode = franchise.accessible_pincodes.find(
      (p) => p.pincode === pincode && p.isActive
    );

    if (existingPincode) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Pincode already added to franchise"));
    }

    // 2. Check if pincode is already assigned to another franchise
    const otherFranchise = await Franchise.findOne({
      _id: { $ne: id },
      "accessible_pincodes.pincode": pincode,
      "accessible_pincodes.isActive": true,
    });

    if (otherFranchise) {
      return res.status(400).json(
        new ApiResponse(
          400,
          {
            conflictingFranchise: {
              id: otherFranchise._id,
              name: otherFranchise.name,
              email: otherFranchise.email,
            },
          },
          `This pincode is already assigned to another franchise: ${otherFranchise.name}`
        )
      );
    }

    // 3. Find drivers with this pincode who don't have any franchise
    const driversWithoutFranchise = await Driver.find({
      pin_code: pincode,
      franchiseId: null, // Only drivers without franchise
    }).select("_id name phone is_on_ride");

    // Filter out drivers who are on ride
    const driversNotOnRide = driversWithoutFranchise.filter(
      (driver) => !driver.is_on_ride
    );
    const driversOnRide = driversWithoutFranchise.filter(
      (driver) => driver.is_on_ride
    );

    // Add pincode to franchise
    franchise.accessible_pincodes.push({
      pincode,
      addedBy: adminId,
      isActive: true,
      addedAt: new Date(),
    });

    await franchise.save();

    // 4. Automatically assign drivers who are not on ride
    if (driversNotOnRide.length > 0) {
      const driverIds = driversNotOnRide.map((driver) => driver._id);

      // Update drivers
      await Driver.updateMany(
        { _id: { $in: driverIds } },
        {
          $set: {
            franchiseId: id,
          },
        }
      );

      // Update franchise driver count
      await Franchise.findByIdAndUpdate(id, {
        $inc: { total_drivers: driversNotOnRide.length },
      });

      // 5. CRITICAL: Update Khata records for assigned drivers
      await Khata.updateMany(
        { driverId: { $in: driverIds } },
        {
          $set: {
            franchiseId: id,
          },
        }
      );

      // 6. Create Khata records for drivers who don't have one yet
      // First, find which drivers don't have Khata records
      const existingKhatas = await Khata.find({
        driverId: { $in: driverIds }
      }).select('driverId');
      
      const existingDriverIds = existingKhatas.map(khata => khata.driverId.toString());
      const driversWithoutKhata = driversNotOnRide.filter(
        driver => !existingDriverIds.includes(driver._id.toString())
      );

      if (driversWithoutKhata.length > 0) {
        // Find admin (assuming there's at least one admin)
        const admin = await Admin.findOne();
        
        const khataRecords = driversWithoutKhata.map(driver => ({
          driverId: driver._id,
          adminId: admin ? admin._id : null,
          franchiseId: id,
          driverdue: 0,
          admindue: 0,
          franchisedue: 0,
          due_payment_details: []
        }));

        if (khataRecords.length > 0) {
          await Khata.insertMany(khataRecords);
        }
      }
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise,
          assignedDrivers: driversNotOnRide.length,
          pendingDriversOnRide: driversOnRide.length,
          pendingDriversDetails: driversOnRide.map((driver) => ({
            id: driver._id,
            name: driver.name,
            phone: driver.phone,
          })),
          message:
            driversOnRide.length > 0
              ? `Pincode added successfully. ${driversNotOnRide.length} driver(s) assigned. ${driversOnRide.length} driver(s) are on ride and need manual assignment.`
              : `Pincode added successfully. ${driversNotOnRide.length} driver(s) assigned to franchise.`,
        },
        "Pincode access added successfully"
      )
    );
  } catch (error) {
    console.error("Error adding pincode access:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to add pincode access"));
  }
});

// Remove Pincode Access from Franchise
export const removePincodeAccess = asyncHandler(async (req, res) => {
  const { id, pincodeId } = req.params; // Franchise ID and pincode entry ID

  if (!id || !pincodeId) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Franchise ID and Pincode ID are required")
      );
  }

  try {
    const franchise = await Franchise.findById(id);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Find the pincode entry
    const pincodeIndex = franchise.accessible_pincodes.findIndex(
      (p) => p._id.toString() === pincodeId
    );

    if (pincodeIndex === -1) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Pincode access not found"));
    }

    // Check if this is the franchise's own address pincode
    if (
      franchise.accessible_pincodes[pincodeIndex].pincode ===
      franchise.address.pincode
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Cannot remove franchise's own address pincode"
          )
        );
    }

    // Remove the pincode (or mark as inactive)
    franchise.accessible_pincodes[pincodeIndex].isActive = false;
    await franchise.save();

    return res
      .status(200)
      .json(
        new ApiResponse(200, franchise, "Pincode access removed successfully")
      );
  } catch (error) {
    console.error("Error removing pincode access:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to remove pincode access"));
  }
});

// Get Franchise's Accessible Pincodes
export const getFranchisePincodes = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    const franchise = await Franchise.findById(id).select(
      "accessible_pincodes address"
    );

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ownPincode: franchise.address.pincode,
          accessiblePincodes: franchise.accessible_pincodes.filter(
            (p) => p.isActive
          ),
        },
        "Franchise pincodes retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error retrieving franchise pincodes:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to retrieve franchise pincodes")
      );
  }
});

// Update Franchise Status (Approve/Disapprove/Activate/Deactivate)
export const updateFranchiseStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isApproved, isActive } = req.body;

  if (!id) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    const updateData = {};
    if (isApproved !== undefined) updateData.isApproved = isApproved;
    if (isActive !== undefined) updateData.isActive = isActive;

    const franchise = await Franchise.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    const statusMessage = [];
    if (isApproved !== undefined) {
      statusMessage.push(isApproved ? "approved" : "disapproved");
    }
    if (isActive !== undefined) {
      statusMessage.push(isActive ? "activated" : "deactivated");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          franchise,
          `Franchise ${statusMessage.join(" and ")} successfully`
        )
      );
  } catch (error) {
    console.error("Error updating franchise status:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update franchise status"));
  }
});

// Get all drivers without franchise with franchise availability info
export const getAllDriversWithoutFranchise = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    includeOnRide = "false",
    pincode,
    district,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  try {
    // Build base query for drivers without franchise
    const query = {
      franchiseId: null, // No franchise assigned
    };

    // Add optional filters
    if (pincode) {
      query.pin_code = pincode;
    }

    if (district) {
      query.district = district;
    }

    // Optionally filter out drivers on ride
    if (includeOnRide === "false") {
      query.is_on_ride = false;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Get drivers without franchise
    const drivers = await Driver.find(query)
      .select(
        "name phone email pin_code district village police_station is_on_ride isActive isApproved total_complete_rides total_earning createdAt"
      )
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ [sortBy]: sortDirection });

    const totalDrivers = await Driver.countDocuments(query);

    // Get all active franchises with their accessible pincodes
    const franchises = await Franchise.find({
      isActive: true,
      isApproved: true,
    }).select("name _id accessible_pincodes");

    // Create a map of pincode to franchise for quick lookup
    const pincodeToFranchiseMap = new Map();

    franchises.forEach((franchise) => {
      franchise.accessible_pincodes
        .filter((p) => p.isActive)
        .forEach((pincodeAccess) => {
          pincodeToFranchiseMap.set(pincodeAccess.pincode, {
            franchiseId: franchise._id,
            franchiseName: franchise.name,
            pincode: pincodeAccess.pincode,
          });
        });
    });

    // Enhance drivers with franchise availability info
    const enhancedDrivers = drivers.map((driver) => {
      const driverData = driver.toObject();
      const pincodeInfo = pincodeToFranchiseMap.get(driver.pin_code);

      return {
        ...driverData,
        franchiseAvailability: {
          hasFranchiseInPincode: !!pincodeInfo,
          franchiseInfo: pincodeInfo
            ? {
                id: pincodeInfo.franchiseId,
                name: pincodeInfo.franchiseName,
              }
            : null,
          status: pincodeInfo
            ? "Franchise available in pincode but driver not assigned"
            : "No franchise available in this pincode",
          canBeAssigned: !driver.is_on_ride && !!pincodeInfo,
        },
      };
    });

    // Count statistics
    const driversWithFranchiseAvailable = enhancedDrivers.filter(
      (d) => d.franchiseAvailability.hasFranchiseInPincode
    ).length;

    const driversReadyForAssignment = enhancedDrivers.filter(
      (d) => d.franchiseAvailability.canBeAssigned
    ).length;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          drivers: enhancedDrivers,
          statistics: {
            totalWithoutFranchise: totalDrivers,
            withFranchiseAvailable: driversWithFranchiseAvailable,
            readyForAssignment: driversReadyForAssignment,
            onRide: enhancedDrivers.filter((d) => d.is_on_ride).length,
          },
          filters: {
            pincode,
            district,
            includeOnRide: includeOnRide === "true",
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalDrivers,
            pages: Math.ceil(totalDrivers / limit),
          },
        },
        "Drivers without franchise retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error retrieving drivers without franchise:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to retrieve drivers without franchise"
        )
      );
  }
});

// Assign drivers to franchise (manual assignment)
export const assignDriversToFranchise = asyncHandler(async (req, res) => {
  const { id } = req.params; // Franchise ID
  const { driverIds } = req.body; // Array of driver IDs
  const adminId = req.user?._id; // Admin who is assigning

  if (
    !id ||
    !driverIds ||
    !Array.isArray(driverIds) ||
    driverIds.length === 0
  ) {
    return res.status(400).json(
      new ApiResponse(400, null, "Missing required fields", {
        required: ["driverIds (array of driver IDs)"],
      })
    );
  }

  // Validate driver IDs are valid ObjectIds
  const validDriverIds = driverIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (validDriverIds.length !== driverIds.length) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid driver ID(s) provided"));
  }

  try {
    // 1. Check if franchise exists and is active/approved
    const franchise = await Franchise.findOne({
      _id: id,
      isActive: true,
      isApproved: true,
    });

    if (!franchise) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "Franchise not found or not active/approved"
          )
        );
    }

    // 2. Get franchise accessible pincodes
    const franchisePincodes = franchise.accessible_pincodes
      .filter((p) => p.isActive)
      .map((p) => p.pincode);

    if (franchisePincodes.length === 0) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Franchise has no accessible pincodes")
        );
    }

    // 3. Find eligible drivers
    const eligibleDrivers = await Driver.find({
      _id: { $in: validDriverIds },
      franchiseId: null, // Only drivers without franchise
      pin_code: { $in: franchisePincodes }, // Driver pincode must match franchise pincodes
      is_on_ride: false, // Only drivers not on ride
    }).select("_id name phone email pin_code district total_earning");

    if (eligibleDrivers.length === 0) {
      // Find out why drivers are not eligible
      const allDrivers = await Driver.find({
        _id: { $in: validDriverIds },
      }).select("_id name phone pin_code franchiseId is_on_ride");

      const errorDetails = allDrivers.map((driver) => {
        const errors = [];
        if (driver.franchiseId) errors.push("Already has a franchise");
        if (driver.is_on_ride) errors.push("Currently on ride");
        if (!franchisePincodes.includes(driver.pin_code))
          errors.push("Pincode doesn't match franchise");
        return {
          id: driver._id,
          name: driver.name,
          phone: driver.phone,
          errors: errors.length > 0 ? errors : ["Unknown error"],
        };
      });

      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            { errorDetails },
            "No eligible drivers found. Check driver status."
          )
        );
    }

    const eligibleDriverIds = eligibleDrivers.map((driver) => driver._id);

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 4. Update drivers with franchise ID
      const updateResult = await Driver.updateMany(
        { _id: { $in: eligibleDriverIds } },
        {
          $set: {
            franchiseId: id,
            updatedAt: new Date(),
          },
        },
        { session }
      );

      // 5. Update franchise driver count
      await Franchise.findByIdAndUpdate(
        id,
        {
          $inc: { total_drivers: eligibleDriverIds.length },
          $set: { updatedAt: new Date() },
        },
        { session }
      );

      // 6. Create/Update khata records for these drivers
      const khataUpdates = [];

      for (const driver of eligibleDrivers) {
        // Check if khata exists for this driver
        const existingKhata = await mongoose
          .model("Khata")
          .findOne({
            driverId: driver._id,
          })
          .session(session);

        if (existingKhata) {
          // Update existing khata with franchiseId
          existingKhata.franchiseId = id;
          existingKhata.updatedAt = new Date();
          await existingKhata.save({ session });
          khataUpdates.push({
            driverId: driver._id,
            action: "updated",
            khataId: existingKhata._id,
          });
        } else {
          // Create new khata entry
          const newKhata = new (mongoose.model("Khata"))({
            driverId: driver._id,
            adminId: adminId,
            franchiseId: id,
            driverdue: 0,
            admindue: 0,
            franchisedue: 0,
            due_payment_details: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await newKhata.save({ session });
          khataUpdates.push({
            driverId: driver._id,
            action: "created",
            khataId: newKhata._id,
          });
        }
      }

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      // 7. Prepare response with details
      const assignedDriversDetails = eligibleDrivers.map((driver) => ({
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        pin_code: driver.pin_code,
        district: driver.district,
      }));

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            assignmentSummary: {
              totalRequested: driverIds.length,
              totalAssigned: eligibleDriverIds.length,
              failed: driverIds.length - eligibleDriverIds.length,
              franchise: {
                id: franchise._id,
                name: franchise.name,
                newTotalDrivers:
                  franchise.total_drivers + eligibleDriverIds.length,
              },
            },
            assignedDrivers: assignedDriversDetails,
            khataUpdates: khataUpdates,
            timestamp: new Date(),
          },
          `${eligibleDriverIds.length} driver(s) assigned to franchise successfully`
        )
      );
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Error assigning drivers to franchise:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to assign drivers to franchise")
      );
  }
});
