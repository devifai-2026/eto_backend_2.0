import { asyncHandler } from "../utils/asyncHandler.js";
import { Franchise } from "../models/franchise.model.js";
import { User } from "../models/user.model.js";
import { Driver } from "../models/driver.model.js";
import { Admin } from "../models/admin.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import mongoose from "mongoose";

// Create Franchise Function
export const createFranchise = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    address,
    bank_details,
    documents,
    description,
    commission_rate,
  } = req.body;

  const adminId = req.user?._id; // Assuming admin is authenticated

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
    const admin = await Admin.findById(adminId);
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
      commission_rate: commission_rate || 10,
      createdBy: adminId,
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

// Get All Franchises Function
export const getAllFranchises = asyncHandler(async (req, res) => {
  try {
    const franchises = await Franchise.find()
      .populate("createdBy", "name email")
      .populate("userId", "phone isVerified")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { franchises, count: franchises.length },
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
    const franchise = await Franchise.findById(id)
      .populate("createdBy", "name email")
      .populate("userId", "phone isVerified")
      .populate("accessible_pincodes.addedBy", "name");

    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise,
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
  const { page = 1, limit = 10, isActive, isApproved } = req.query;

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
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (isApproved !== undefined) query.isApproved = isApproved === "true";

    const skip = (page - 1) * limit;

    const drivers = await Driver.find(query)
      .select(
        "name phone email isActive isApproved total_complete_rides total_earning current_location createdAt"
      )
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const totalDrivers = await Driver.countDocuments(query);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          drivers,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalDrivers,
            pages: Math.ceil(totalDrivers / limit),
          },
          franchise: {
            name: franchise.name,
            total_drivers: franchise.total_drivers,
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

// Add Pincode Access to Franchise
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
