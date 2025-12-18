import { asyncHandler } from "../utils/asyncHandler.js";
import { FranchiseCommissionSettings } from "../models/commissionSettings.model.js";
import { Franchise } from "../models/franchise.model.js";
import { Admin } from "../models/admin.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import { DueRequest } from "../models/dueRequest.model.js";
import { Driver } from "../models/driver.model.js";
import { RideDetails } from "../models/rideDetails.model.js";
import { Khata } from "../models/khata.model.js";

// Get commission settings for a specific franchise
export const getFranchiseCommissionSettings = asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;

  if (!franchiseId) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    let commissionSettings = await FranchiseCommissionSettings.findOne({
      franchiseId,
      isActive: true,
    }).populate("last_changed_by", "name email");

    // If commission settings don't exist, create default ones
    if (!commissionSettings) {
      const admin = await Admin.findOne();
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      commissionSettings = new FranchiseCommissionSettings({
        franchiseId,
        admin_commission_rate: 18,
        franchise_commission_rate: 10,
        last_changed_by: admin._id,
      });

      // Add initial history entry
      commissionSettings.settings_history.push({
        setting_type: "admin_commission",
        field_name: "admin_commission_rate",
        old_value: 0,
        new_value: 18,
        changed_by: admin._id,
        changed_at: new Date(),
        reason: "Initial commission settings created",
      });

      commissionSettings.settings_history.push({
        setting_type: "franchise_commission",
        field_name: "franchise_commission_rate",
        old_value: 0,
        new_value: 10,
        changed_by: admin._id,
        changed_at: new Date(),
        reason: "Initial commission settings created",
      });

      await commissionSettings.save();
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: {
            _id: franchise._id,
            name: franchise.name,
            email: franchise.email,
          },
          commission_settings: commissionSettings,
        },
        "Franchise commission settings fetched successfully"
      )
    );
  } catch (error) {
    console.error(
      "Error fetching franchise commission settings:",
      error.message
    );
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to fetch franchise commission settings"
        )
      );
  }
});

// Update commission settings for a franchise
export const updateFranchiseCommissionSettings = asyncHandler(
  async (req, res) => {
    const { franchiseId } = req.params;
    const { admin_commission_rate, franchise_commission_rate, reason } =
      req.body;

    if (!franchiseId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Franchise ID is required"));
    }

    // Check if at least one commission rate is provided
    if (
      admin_commission_rate === undefined &&
      franchise_commission_rate === undefined
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "At least one commission rate is required")
        );
    }

    try {
      // Get the admin (there's only one)
      const admin = await Admin.findOne();
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      // Check if franchise exists
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      // 1. Check if any driver under this franchise is currently on a ride
      const activeRideDrivers = await Driver.find({
        franchiseId,
        is_on_ride: true,
        isActive: true,
      });

      if (activeRideDrivers.length > 0) {
        const driverNames = activeRideDrivers.map((d) => d.name).join(", ");
        return res.status(400).json(
          new ApiResponse(
            400,
            {
              activeDrivers: activeRideDrivers.map((d) => ({
                id: d._id,
                name: d.name,
              })),
            },
            `Cannot update commission settings while drivers are on active rides: ${driverNames}`
          )
        );
      }

      // 2. Check for drivers with due requests or due balances
      const driversWithDue = await Driver.find({
        franchiseId,
        $or: [{ due_wallet: { $gt: 0 } }],
      });

      const dueRequests = await DueRequest.find({
        requestedBy: { $in: driversWithDue.map((d) => d._id) },
        status: "pending",
      }).populate("requestedBy", "name phone");

      let warningMessage = "";
      if (driversWithDue.length > 0 || dueRequests.length > 0) {
        warningMessage =
          "Warning: Some drivers have due balances or pending due requests. Commission changes will affect future rides only.";
      }

      // Get or create commission settings
      let commissionSettings = await FranchiseCommissionSettings.findOne({
        franchiseId,
        isActive: true,
      });

      if (!commissionSettings) {
        // Create new commission settings if they don't exist
        commissionSettings = new FranchiseCommissionSettings({
          franchiseId,
          admin_commission_rate: 18,
          franchise_commission_rate: 10,
          last_changed_by: admin._id,
        });
      }

      const updates = [];
      const responseData = {};

      // Track old rates for khata update
      const oldAdminRate = commissionSettings.admin_commission_rate;
      const oldFranchiseRate = commissionSettings.franchise_commission_rate;
      let newAdminRate = oldAdminRate;
      let newFranchiseRate = oldFranchiseRate;

      // Update admin commission rate if provided
      if (admin_commission_rate !== undefined) {
        if (admin_commission_rate < 0 || admin_commission_rate > 100) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                "Admin commission rate must be between 0 and 100"
              )
            );
        }

        if (
          admin_commission_rate !== commissionSettings.admin_commission_rate
        ) {
          updates.push({
            setting_type: "admin_commission",
            field_name: "admin_commission_rate",
            old_value: commissionSettings.admin_commission_rate,
            new_value: admin_commission_rate,
            changed_by: admin._id,
            changed_at: new Date(),
            reason: reason || "Admin commission rate updated",
          });

          responseData.admin_commission_rate = {
            old: commissionSettings.admin_commission_rate,
            new: admin_commission_rate,
          };
          commissionSettings.admin_commission_rate = admin_commission_rate;
          newAdminRate = admin_commission_rate;
        }
      }

      // Update franchise commission rate if provided
      if (franchise_commission_rate !== undefined) {
        if (franchise_commission_rate < 0 || franchise_commission_rate > 100) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                "Franchise commission rate must be between 0 and 100"
              )
            );
        }

        if (
          franchise_commission_rate !==
          commissionSettings.franchise_commission_rate
        ) {
          updates.push({
            setting_type: "franchise_commission",
            field_name: "franchise_commission_rate",
            old_value: commissionSettings.franchise_commission_rate,
            new_value: franchise_commission_rate,
            changed_by: admin._id,
            changed_at: new Date(),
            reason: reason || "Franchise commission rate updated",
          });

          responseData.franchise_commission_rate = {
            old: commissionSettings.franchise_commission_rate,
            new: franchise_commission_rate,
          };
          commissionSettings.franchise_commission_rate =
            franchise_commission_rate;
          newFranchiseRate = franchise_commission_rate;
        }
      }

      // If no changes were made
      if (updates.length === 0) {
        return res
          .status(200)
          .json(
            new ApiResponse(200, commissionSettings, "No changes detected")
          );
      }

      // Add all updates to history
      commissionSettings.settings_history.push(...updates);

      // Update last_changed_by
      commissionSettings.last_changed_by = admin._id;
      await commissionSettings.save();

      // 3. Update Khata records for pending payments with new commission rates
      if (
        oldFranchiseRate !== newFranchiseRate ||
        oldAdminRate !== newAdminRate
      ) {
        await updateKhataForFranchise(
          franchiseId,
          oldFranchiseRate,
          newFranchiseRate,
          oldAdminRate,
          newAdminRate
        );
      }

      // Populate last_changed_by for response
      await commissionSettings.populate("last_changed_by", "name email");

      const response = {
        franchise: {
          _id: franchise._id,
          name: franchise.name,
        },
        commission_settings: commissionSettings,
        changes_made: responseData,
        total_changes: updates.length,
        warnings: {
          hasActiveRides: false,
          hasDueIssues: driversWithDue.length > 0 || dueRequests.length > 0,
          dueDriversCount: driversWithDue.length,
          pendingRequestsCount: dueRequests.length,
          message: warningMessage,
        },
      };

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            response,
            "Franchise commission settings updated successfully" +
              (warningMessage ? ` (${warningMessage})` : "")
          )
        );
    } catch (error) {
      console.error(
        "Error updating franchise commission settings:",
        error.message
      );
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            "Failed to update franchise commission settings"
          )
        );
    }
  }
);

// Helper function to update Khata records when commission rates change
async function updateKhataForFranchise(
  franchiseId,
  newFranchiseRate,
  newAdminRate
) {
  try {
    // Find all khatas for this franchise with pending payments
    const khatas = await Khata.find({
      franchiseId,
      due_payment_details: { $exists: true, $not: { $size: 0 } },
    }).populate({
      path: "due_payment_details.rideId",
      model: "RideDetails",
    });

    for (const khata of khatas) {
      let updated = false;

      // Update each due_payment_detail that hasn't been paid yet
      for (const detail of khata.due_payment_details) {
        if (detail.rideId) {
          const ride = detail.rideId;

          // Recalculate profits with new commission rates
          const totalAmount = ride.total_amount || detail.total_price;

          // Calculate new franchise profit
          const newFranchiseProfit = Math.ceil(
            (newFranchiseRate / 100) * totalAmount
          );
          const newAdminProfit = Math.ceil((newAdminRate / 100) * totalAmount);
          const newDriverProfit = Math.ceil(
            totalAmount - newFranchiseProfit - newAdminProfit
          );

          // Update the detail record
          detail.franchise_profit = newFranchiseProfit;
          detail.admin_profit = newAdminProfit;
          detail.driver_profit = newDriverProfit;
          updated = true;
        }
      }

      if (updated) {
        // Recalculate total dues
        khata.franchisedue = khata.due_payment_details.reduce(
          (sum, detail) => sum + (detail.franchise_profit || 0),
          0
        );
        khata.admindue = khata.due_payment_details.reduce(
          (sum, detail) => sum + (detail.admin_profit || 0),
          0
        );
        khata.driverdue = khata.due_payment_details.reduce(
          (sum, detail) => sum + (detail.driver_profit || 0),
          0
        );

        await khata.save();

        // Update driver's due_wallet if needed
        const driver = await Driver.findById(khata.driverId);
        if (driver) {
          driver.due_wallet = khata.admindue + khata.franchisedue;
          await driver.save();
        }
      }
    }

    console.log(
      `Updated ${khatas.length} khata records for franchise ${franchiseId}`
    );
  } catch (error) {
    console.error("Error updating khata records:", error.message);
    throw error;
  }
}

//  Get all franchises with their commission settings
export const getAllFranchisesWithCommissionSettings = asyncHandler(
  async (req, res) => {
    try {
      const { page = 1, limit = 10, search = "", status = "" } = req.query;
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
      const skip = (pageNumber - 1) * pageSize;

      // Build search query
      let franchiseQuery = { isActive: true };

      if (search) {
        franchiseQuery.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { "address.city": { $regex: search, $options: "i" } },
          { "address.district": { $regex: search, $options: "i" } },
        ];
      }

      // Get total count
      const totalFranchises = await Franchise.countDocuments(franchiseQuery);

      // Get franchises with pagination
      const franchises = await Franchise.find(franchiseQuery)
        .select(
          "name email phone address.city address.district total_drivers total_earnings isActive isApproved createdBy total_completed_rides"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean();

      // Get franchise IDs
      const franchiseIds = franchises.map((f) => f._id);

      // Get commission settings for all franchises
      const commissionSettings = await FranchiseCommissionSettings.find({
        franchiseId: { $in: franchiseIds },
      }).populate("last_changed_by", "name email");

      // Get additional statistics for each franchise
      // You might need to query your ride model for more accurate stats
      // This is a simplified example

      // Get driver counts for each franchise
      const driverCounts = await Driver.aggregate([
        { $match: { franchiseId: { $in: franchiseIds }, isActive: true } },
        { $group: { _id: "$franchiseId", count: { $sum: 1 } } },
      ]);

      // Get recent earnings/rides for each franchise
      // This depends on your data model - adjust as needed
      const rideStats = await RideDetails.aggregate([
        {
          $match: {
            franchiseId: { $in: franchiseIds },
            ride_status: "completed",
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            }, // Last 30 days
          },
        },
        {
          $group: {
            _id: "$franchiseId",
            total_rides: { $sum: 1 },
            total_earnings: { $sum: "$total_amount" },
          },
        },
      ]);

      // Create maps for quick lookup
      const settingsMap = {};
      const driverCountMap = {};
      const rideStatsMap = {};

      commissionSettings.forEach((setting) => {
        settingsMap[setting.franchiseId.toString()] = setting;
      });

      driverCounts.forEach((item) => {
        driverCountMap[item._id.toString()] = item.count;
      });

      rideStats.forEach((item) => {
        rideStatsMap[item._id.toString()] = {
          recent_rides: item.total_rides,
          recent_earnings: item.total_earnings,
        };
      });

      // Calculate summary statistics
      const summary = {
        total_franchises: totalFranchises,
        active_franchises: franchises.filter((f) => f.isActive && f.isApproved)
          .length,
        approved_franchises: franchises.filter((f) => f.isApproved).length,
        pending_settings: franchises.filter(
          (f) => !settingsMap[f._id.toString()]
        ).length,
        total_commission_changes: commissionSettings.reduce(
          (sum, setting) => sum + (setting.settings_history?.length || 0),
          0
        ),
        total_admin_commission: commissionSettings.reduce(
          (sum, setting) => sum + setting.admin_commission_rate,
          0
        ),
        total_franchise_commission: commissionSettings.reduce(
          (sum, setting) => sum + setting.franchise_commission_rate,
          0
        ),
        total_drivers: driverCounts.reduce((sum, item) => sum + item.count, 0),
        total_completed_rides: rideStats.reduce(
          (sum, item) => sum + item.total_rides,
          0
        ),
        total_franchise_earnings: rideStats.reduce(
          (sum, item) => sum + item.total_earnings,
          0
        ),
        total_admin_earnings: rideStats.reduce(
          (sum, item) => sum + item.total_earnings * 0.18,
          0
        ), // Assuming 18% admin commission
      };

      // Combine franchise data with commission settings and additional stats
      const franchisesWithSettings = franchises.map((franchise) => {
        const settings = settingsMap[franchise._id.toString()] || null;
        const driverCount = driverCountMap[franchise._id.toString()] || 0;
        const recentStats = rideStatsMap[franchise._id.toString()] || {
          recent_rides: 0,
          recent_earnings: 0,
        };

        return {
          franchise: {
            ...franchise,
            driver_count: driverCount,
            recent_rides: recentStats.recent_rides,
            recent_earnings: recentStats.recent_earnings,
            franchise_earnings: franchise.total_earnings || 0,
          },
          commission_settings: settings
            ? {
                _id: settings._id,
                admin_commission_rate: settings.admin_commission_rate,
                franchise_commission_rate: settings.franchise_commission_rate,
                isActive: settings.isActive,
                last_changed_by: settings.last_changed_by,
                settings_history_count: settings.settings_history?.length || 0,
                createdAt: settings.createdAt,
                updatedAt: settings.updatedAt,
              }
            : null,
        };
      });

      // Apply status filter if provided
      let filteredFranchises = franchisesWithSettings;
      if (status === "active") {
        filteredFranchises = franchisesWithSettings.filter(
          (item) => item.commission_settings?.isActive === true
        );
      } else if (status === "inactive") {
        filteredFranchises = franchisesWithSettings.filter(
          (item) =>
            item.commission_settings &&
            item.commission_settings.isActive === false
        );
      } else if (status === "pending") {
        filteredFranchises = franchisesWithSettings.filter(
          (item) => !item.commission_settings
        );
      }

      const totalPages = Math.ceil(filteredFranchises.length / pageSize);
      const paginatedFranchises = filteredFranchises.slice(
        skip,
        skip + pageSize
      );

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            summary,
            franchises: paginatedFranchises,
            pagination: {
              total: filteredFranchises.length,
              page: pageNumber,
              pages: totalPages,
              limit: pageSize,
              hasNextPage: pageNumber < totalPages,
              hasPrevPage: pageNumber > 1,
            },
          },
          "All franchises with commission settings fetched successfully"
        )
      );
    } catch (error) {
      console.error(
        "Error fetching franchises with commission settings:",
        error.message
      );
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            "Failed to fetch franchises with commission settings"
          )
        );
    }
  }
);

// Get commission settings history for a franchise
export const getFranchiseCommissionHistory = asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;
  const { setting_type, limit = 50, page = 1 } = req.query;

  if (!franchiseId) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Franchise ID is required"));
  }

  try {
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    const commissionSettings = await FranchiseCommissionSettings.findOne({
      franchiseId,
      isActive: true,
    });

    if (!commissionSettings || !commissionSettings.settings_history.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            [],
            "No commission history found for this franchise"
          )
        );
    }

    let history = commissionSettings.settings_history;

    // Apply filter if provided
    if (setting_type) {
      history = history.filter((item) => item.setting_type === setting_type);
    }

    // Sort by most recent first
    history.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));

    // Pagination
    const total = history.length;
    const pageSize = parseInt(limit);
    const currentPage = parseInt(page);
    const totalPages = Math.ceil(total / pageSize);

    const paginatedHistory = history.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );

    // Populate changed_by for each history item
    const populatedHistory = await Promise.all(
      paginatedHistory.map(async (item) => {
        if (item.changed_by) {
          const admin = await Admin.findById(item.changed_by).select(
            "name email"
          );
          return {
            ...(item.toObject ? item.toObject() : item),
            changed_by: admin,
          };
        }
        return item;
      })
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: {
            _id: franchise._id,
            name: franchise.name,
          },
          history: populatedHistory,
          pagination: {
            total,
            page: currentPage,
            pages: totalPages,
            limit: pageSize,
          },
          current_settings: {
            admin_commission_rate: commissionSettings.admin_commission_rate,
            franchise_commission_rate:
              commissionSettings.franchise_commission_rate,
          },
        },
        "Franchise commission history fetched successfully"
      )
    );
  } catch (error) {
    console.error(
      "Error fetching franchise commission history:",
      error.message
    );
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Failed to fetch franchise commission history"
        )
      );
  }
});

//  Deactivate commission settings for a franchise
export const deactivateFranchiseCommissionSettings = asyncHandler(
  async (req, res) => {
    const { franchiseId } = req.params;
    const { reason } = req.body;

    if (!franchiseId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Franchise ID is required"));
    }

    try {
      const admin = await Admin.findOne();
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      const commissionSettings =
        await FranchiseCommissionSettings.findOneAndUpdate(
          { franchiseId, isActive: true },
          {
            isActive: false,
            last_changed_by: admin._id,
          },
          { new: true }
        );

      if (!commissionSettings) {
        return res
          .status(404)
          .json(
            new ApiResponse(
              404,
              null,
              "Active commission settings not found for this franchise"
            )
          );
      }

      // Add to history
      commissionSettings.settings_history.push({
        setting_type: "system",
        field_name: "isActive",
        old_value: 1,
        new_value: 0,
        changed_by: admin._id,
        changed_at: new Date(),
        reason: reason || "Commission settings deactivated",
      });

      await commissionSettings.save();

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            franchise: {
              _id: franchise._id,
              name: franchise.name,
            },
            commission_settings: commissionSettings,
          },
          "Franchise commission settings deactivated successfully"
        )
      );
    } catch (error) {
      console.error(
        "Error deactivating franchise commission settings:",
        error.message
      );
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            "Failed to deactivate franchise commission settings"
          )
        );
    }
  }
);

// Reactivate commission settings for a franchise
export const reactivateFranchiseCommissionSettings = asyncHandler(
  async (req, res) => {
    const { franchiseId } = req.params;
    const { reason } = req.body;

    if (!franchiseId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Franchise ID is required"));
    }

    try {
      const admin = await Admin.findOne();
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      const commissionSettings =
        await FranchiseCommissionSettings.findOneAndUpdate(
          { franchiseId, isActive: false },
          {
            isActive: true,
            last_changed_by: admin._id,
          },
          { new: true }
        );

      if (!commissionSettings) {
        return res
          .status(404)
          .json(
            new ApiResponse(
              404,
              null,
              "Inactive commission settings not found for this franchise"
            )
          );
      }

      // Add to history
      commissionSettings.settings_history.push({
        setting_type: "system",
        field_name: "isActive",
        old_value: 0,
        new_value: 1,
        changed_by: admin._id,
        changed_at: new Date(),
        reason: reason || "Commission settings reactivated",
      });

      await commissionSettings.save();

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            franchise: {
              _id: franchise._id,
              name: franchise.name,
            },
            commission_settings: commissionSettings,
          },
          "Franchise commission settings reactivated successfully"
        )
      );
    } catch (error) {
      console.error(
        "Error reactivating franchise commission settings:",
        error.message
      );
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            "Failed to reactivate franchise commission settings"
          )
        );
    }
  }
);
