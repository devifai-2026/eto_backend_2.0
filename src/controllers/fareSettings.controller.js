import { asyncHandler } from "../utils/asyncHandler.js";
import { FareSettings } from "../models/fareSettings.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";

//  Get current fare settings (public route)
export const getFareSettings = asyncHandler(async (req, res) => {
  try {
    const fareSettings = await FareSettings.getSettings();

    // Populate last_changed_by if exists
    if (fareSettings.last_changed_by) {
      await fareSettings.populate({
        path: "last_changed_by",
        select: "name email",
      });
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, fareSettings, "Fare settings fetched successfully")
      );
  } catch (error) {
    console.error("Error fetching fare settings:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch fare settings"));
  }
});

//  Create/Initialize fare settings (admin only - one-time setup)
export const createFareSettings = asyncHandler(async (req, res) => {
  try {
    // Check if settings already exist
    const existingSettings = await FareSettings.findOne();
    if (existingSettings) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Fare settings already exist. Use update instead."
          )
        );
    }

    const {
      base_fare = 20,
      per_km_charge = 8,
      night_surcharge_percentage = 20,
      night_start_hour = 22,
      night_end_hour = 6,
    } = req.body;

    // Validate inputs
    if (base_fare < 0 || per_km_charge < 0) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Fare values cannot be negative"));
    }

    if (night_surcharge_percentage < 0 || night_surcharge_percentage > 100) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Night surcharge must be between 0 and 100"
          )
        );
    }

    if (
      night_start_hour < 0 ||
      night_start_hour > 23 ||
      night_end_hour < 0 ||
      night_end_hour > 23
    ) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Night hours must be between 0 and 23")
        );
    }

    // Get admin ID from the Admin model (there's only one admin)
    const admin = await Admin.findOne();
    if (!admin) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "Admin not found. Please create an admin first."
          )
        );
    }
    const adminId = admin._id;

    const fareSettings = new FareSettings({
      base_fare,
      per_km_charge,
      night_surcharge_percentage,
      night_start_hour,
      night_end_hour,
      last_changed_by: adminId,
    });

    // Add initial history entry
    fareSettings.fare_history.push({
      field_name: "initial_setup",
      old_value: 0,
      new_value: 1,
      changed_by: adminId,
      changed_at: new Date(),
      reason: "Initial fare settings created",
    });

    await fareSettings.save();

    return res
      .status(201)
      .json(
        new ApiResponse(201, fareSettings, "Fare settings created successfully")
      );
  } catch (error) {
    console.error("Error creating fare settings:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create fare settings"));
  }
});

//  Update fare settings (admin only - bulk update)
export const updateFareSettings = asyncHandler(async (req, res) => {
  const {
    base_fare,
    per_km_charge,
    night_surcharge_percentage,
    night_start_hour,
    night_end_hour,
    reason,
  } = req.body;

  // Get admin ID from the Admin model (there's only one admin)
  const admin = await Admin.findOne();
  if (!admin) {
    return res
      .status(404)
      .json(
        new ApiResponse(
          404,
          null,
          "Admin not found. Please create an admin first."
        )
      );
  }
  const adminId = admin._id;

  // Check if any field is provided
  const hasUpdates = [
    base_fare,
    per_km_charge,
    night_surcharge_percentage,
    night_start_hour,
    night_end_hour,
  ].some((field) => field !== undefined);

  if (!hasUpdates) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No fields provided for update"));
  }

  try {
    const fareSettings = await FareSettings.getSettings();
    const updates = [];
    const responseData = {};

    // Update base_fare if provided
    if (base_fare !== undefined) {
      if (base_fare < 0) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Base fare cannot be negative"));
      }
      if (base_fare !== fareSettings.base_fare) {
        updates.push({
          field_name: "base_fare",
          old_value: fareSettings.base_fare,
          new_value: base_fare,
        });
        fareSettings.base_fare = base_fare;
        responseData.base_fare = {
          old: fareSettings.base_fare,
          new: base_fare,
        };
      }
    }

    // Update per_km_charge if provided
    if (per_km_charge !== undefined) {
      if (per_km_charge < 0) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Per km charge cannot be negative"));
      }
      if (per_km_charge !== fareSettings.per_km_charge) {
        updates.push({
          field_name: "per_km_charge",
          old_value: fareSettings.per_km_charge,
          new_value: per_km_charge,
        });
        fareSettings.per_km_charge = per_km_charge;
        responseData.per_km_charge = {
          old: fareSettings.per_km_charge,
          new: per_km_charge,
        };
      }
    }

    // Update night_surcharge_percentage if provided
    if (night_surcharge_percentage !== undefined) {
      if (night_surcharge_percentage < 0 || night_surcharge_percentage > 100) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Night surcharge must be between 0 and 100"
            )
          );
      }
      if (
        night_surcharge_percentage !== fareSettings.night_surcharge_percentage
      ) {
        updates.push({
          field_name: "night_surcharge_percentage",
          old_value: fareSettings.night_surcharge_percentage,
          new_value: night_surcharge_percentage,
        });
        fareSettings.night_surcharge_percentage = night_surcharge_percentage;
        responseData.night_surcharge_percentage = {
          old: fareSettings.night_surcharge_percentage,
          new: night_surcharge_percentage,
        };
      }
    }

    // Update night_start_hour if provided
    if (night_start_hour !== undefined) {
      if (night_start_hour < 0 || night_start_hour > 23) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Night start hour must be between 0 and 23"
            )
          );
      }
      if (night_start_hour !== fareSettings.night_start_hour) {
        updates.push({
          field_name: "night_start_hour",
          old_value: fareSettings.night_start_hour,
          new_value: night_start_hour,
        });
        fareSettings.night_start_hour = night_start_hour;
        responseData.night_start_hour = {
          old: fareSettings.night_start_hour,
          new: night_start_hour,
        };
      }
    }

    // Update night_end_hour if provided
    if (night_end_hour !== undefined) {
      if (night_end_hour < 0 || night_end_hour > 23) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Night end hour must be between 0 and 23"
            )
          );
      }
      if (night_end_hour !== fareSettings.night_end_hour) {
        updates.push({
          field_name: "night_end_hour",
          old_value: fareSettings.night_end_hour,
          new_value: night_end_hour,
        });
        fareSettings.night_end_hour = night_end_hour;
        responseData.night_end_hour = {
          old: fareSettings.night_end_hour,
          new: night_end_hour,
        };
      }
    }

    // If no actual changes were made
    if (updates.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse(200, fareSettings, "No changes detected"));
    }

    // Add all updates to history
    updates.forEach((update) => {
      fareSettings.fare_history.push({
        ...update,
        changed_by: adminId,
        changed_at: new Date(),
        reason: reason || "Fare settings updated",
      });
    });

    // Update last_changed_by
    fareSettings.last_changed_by = adminId;
    await fareSettings.save();

    // Populate last_changed_by for response
    await fareSettings.populate({
      path: "last_changed_by",
      select: "name email",
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          updated_settings: fareSettings,
          changes_made: responseData,
          total_changes: updates.length,
        },
        "Fare settings updated successfully"
      )
    );
  } catch (error) {
    console.error("Error updating fare settings:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update fare settings"));
  }
});

//  Calculate fare for a ride (public route)
export const calculateFare = asyncHandler(async (req, res) => {
  const { distance_km, ride_start_time } = req.body;

  // Validate required fields
  if (!distance_km || distance_km <= 0) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Valid distance in kilometers is required")
      );
  }

  try {
    const fareSettings = await FareSettings.getSettings();
    const distance = parseFloat(distance_km);

    // Calculate base fare
    let totalFare = fareSettings.base_fare;

    // Add distance charge
    totalFare += distance * fareSettings.per_km_charge;

    // Check for night surcharge
    let isNightTime = false;
    let nightSurchargeAmount = 0;

    if (ride_start_time) {
      const rideHour = new Date(ride_start_time).getHours();

      // Check if ride is during night hours
      // Handle case where night spans across midnight (e.g., 10 PM to 6 AM)
      if (fareSettings.night_start_hour < fareSettings.night_end_hour) {
        // Normal case: night time doesn't cross midnight
        isNightTime =
          rideHour >= fareSettings.night_start_hour &&
          rideHour < fareSettings.night_end_hour;
      } else {
        // Night time crosses midnight (e.g., 10 PM to 6 AM)
        isNightTime =
          rideHour >= fareSettings.night_start_hour ||
          rideHour < fareSettings.night_end_hour;
      }

      if (isNightTime) {
        nightSurchargeAmount =
          totalFare * (fareSettings.night_surcharge_percentage / 100);
        totalFare += nightSurchargeAmount;
      }
    }

    // Round to nearest whole number
    totalFare = Math.round(totalFare);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          fare_calculation: {
            base_fare: fareSettings.base_fare,
            distance_km: distance,
            per_km_charge: fareSettings.per_km_charge,
            distance_charge: Math.round(distance * fareSettings.per_km_charge),
            is_night_time: isNightTime,
            night_surcharge_percentage: isNightTime
              ? fareSettings.night_surcharge_percentage
              : 0,
            night_surcharge_amount: Math.round(nightSurchargeAmount),
            total_fare: totalFare,
          },
          fare_settings: {
            base_fare: fareSettings.base_fare,
            per_km_charge: fareSettings.per_km_charge,
            night_surcharge_percentage: fareSettings.night_surcharge_percentage,
            night_hours: `${fareSettings.night_start_hour}:00 - ${fareSettings.night_end_hour}:00`,
          },
        },
        "Fare calculated successfully"
      )
    );
  } catch (error) {
    console.error("Error calculating fare:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to calculate fare"));
  }
});

//  Get fare change history (admin only)
export const getFareHistory = asyncHandler(async (req, res) => {
  const { field_name, start_date, end_date, limit = 50, page = 1 } = req.query;

  try {
    const fareSettings = await FareSettings.getSettings();

    // Get history and populate changed_by field
    let history = await FareSettings.findOne()
      .select("fare_history")
      .populate({
        path: "fare_history.changed_by",
        select: "name email",
      })
      .then((doc) => doc?.fare_history || []);

    // Apply filters
    if (field_name) {
      history = history.filter((item) => item.field_name === field_name);
    }

    if (start_date) {
      const start = new Date(start_date);
      history = history.filter((item) => new Date(item.changed_at) >= start);
    }

    if (end_date) {
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999); // End of day
      history = history.filter((item) => new Date(item.changed_at) <= end);
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

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          history: paginatedHistory,
          pagination: {
            total,
            page: currentPage,
            pages: totalPages,
            limit: pageSize,
          },
          current_settings: {
            base_fare: fareSettings.base_fare,
            per_km_charge: fareSettings.per_km_charge,
            night_surcharge_percentage: fareSettings.night_surcharge_percentage,
            night_start_hour: fareSettings.night_start_hour,
            night_end_hour: fareSettings.night_end_hour,
          },
        },
        "Fare history fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching fare history:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch fare history"));
  }
});

//  Reset fare settings to defaults (admin only)
export const resetFareSettings = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  // Get admin ID from the Admin model (there's only one admin)
  const admin = await Admin.findOne();
  if (!admin) {
    return res
      .status(404)
      .json(
        new ApiResponse(
          404,
          null,
          "Admin not found. Please create an admin first."
        )
      );
  }
  const adminId = admin._id;

  if (!reason) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Reason for reset is required"));
  }

  try {
    const fareSettings = await FareSettings.getSettings();

    const defaults = {
      base_fare: 20,
      per_km_charge: 8,
      night_surcharge_percentage: 20,
      night_start_hour: 22,
      night_end_hour: 6,
    };

    // Create history entries for all changed fields
    const historyEntries = [];
    const changes = {};

    if (fareSettings.base_fare !== defaults.base_fare) {
      historyEntries.push({
        field_name: "base_fare",
        old_value: fareSettings.base_fare,
        new_value: defaults.base_fare,
        changed_by: adminId,
        changed_at: new Date(),
        reason: `Reset to default: ${reason}`,
      });
      changes.base_fare = {
        old: fareSettings.base_fare,
        new: defaults.base_fare,
      };
      fareSettings.base_fare = defaults.base_fare;
    }

    if (fareSettings.per_km_charge !== defaults.per_km_charge) {
      historyEntries.push({
        field_name: "per_km_charge",
        old_value: fareSettings.per_km_charge,
        new_value: defaults.per_km_charge,
        changed_by: adminId,
        changed_at: new Date(),
        reason: `Reset to default: ${reason}`,
      });
      changes.per_km_charge = {
        old: fareSettings.per_km_charge,
        new: defaults.per_km_charge,
      };
      fareSettings.per_km_charge = defaults.per_km_charge;
    }

    if (
      fareSettings.night_surcharge_percentage !==
      defaults.night_surcharge_percentage
    ) {
      historyEntries.push({
        field_name: "night_surcharge_percentage",
        old_value: fareSettings.night_surcharge_percentage,
        new_value: defaults.night_surcharge_percentage,
        changed_by: adminId,
        changed_at: new Date(),
        reason: `Reset to default: ${reason}`,
      });
      changes.night_surcharge_percentage = {
        old: fareSettings.night_surcharge_percentage,
        new: defaults.night_surcharge_percentage,
      };
      fareSettings.night_surcharge_percentage =
        defaults.night_surcharge_percentage;
    }

    if (fareSettings.night_start_hour !== defaults.night_start_hour) {
      historyEntries.push({
        field_name: "night_start_hour",
        old_value: fareSettings.night_start_hour,
        new_value: defaults.night_start_hour,
        changed_by: adminId,
        changed_at: new Date(),
        reason: `Reset to default: ${reason}`,
      });
      changes.night_start_hour = {
        old: fareSettings.night_start_hour,
        new: defaults.night_start_hour,
      };
      fareSettings.night_start_hour = defaults.night_start_hour;
    }

    if (fareSettings.night_end_hour !== defaults.night_end_hour) {
      historyEntries.push({
        field_name: "night_end_hour",
        old_value: fareSettings.night_end_hour,
        new_value: defaults.night_end_hour,
        changed_by: adminId,
        changed_at: new Date(),
        reason: `Reset to default: ${reason}`,
      });
      changes.night_end_hour = {
        old: fareSettings.night_end_hour,
        new: defaults.night_end_hour,
      };
      fareSettings.night_end_hour = defaults.night_end_hour;
    }

    // If no changes needed
    if (historyEntries.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            fareSettings,
            "Settings are already at default values"
          )
        );
    }

    // Add all history entries
    fareSettings.fare_history.push(...historyEntries);

    // Update last_changed_by
    fareSettings.last_changed_by = adminId;
    await fareSettings.save();

    // Populate last_changed_by for response
    await fareSettings.populate({
      path: "last_changed_by",
      select: "name email",
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          settings: fareSettings,
          changes_made: changes,
          total_changes: historyEntries.length,
        },
        "Fare settings reset to defaults successfully"
      )
    );
  } catch (error) {
    console.error("Error resetting fare settings:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to reset fare settings"));
  }
});

//  Delete fare settings (admin only - for testing/cleanup)
export const deleteFareSettings = asyncHandler(async (req, res) => {
  // Get admin ID from the Admin model (there's only one admin)
  const admin = await Admin.findOne();
  if (!admin) {
    return res
      .status(404)
      .json(
        new ApiResponse(
          404,
          null,
          "Admin not found. Please create an admin first."
        )
      );
  }
  const adminId = admin._id;

  try {
    const result = await FareSettings.deleteOne({});

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "No fare settings found to delete"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Fare settings deleted successfully"));
  } catch (error) {
    console.error("Error deleting fare settings:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to delete fare settings"));
  }
});
