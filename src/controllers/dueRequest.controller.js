import mongoose from "mongoose";
import { Admin } from "../models/admin.model.js";
import { Driver } from "../models/driver.model.js";
import { DueRequest } from "../models/dueRequest.model.js";
import { Khata } from "../models/khata.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { Franchise } from "../models/franchise.model.js";

// Create Due Request
export const createDueRequest = asyncHandler(async (req, res) => {
  const { requestedBy, dueAmount, notes, paymentMethod, paymentPhoto } =
    req.body;

  try {
    const admin = await mongoose.model("Admin").findOne();
    if (!admin) {
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Admin not found"));
    }

    // Validate input data
    if (!requestedBy || !dueAmount || !paymentPhoto) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Missing required fields"));
    }

    // Create a new due request
    const newDueRequest = new DueRequest({
      requestedBy,
      adminId: admin._id,
      dueAmount,
      status: "pending", // Default status is "pending"
      notes: notes || "", // If notes are not provided, default to an empty string
      paymentMethod: paymentMethod || "cash", // Default to "cash" if not provided
      paymentPhoto, // Payment photo URL or file path
    });

    // Save the new due request to the database
    await newDueRequest.save();

    // Respond with success
    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { dueRequest: newDueRequest },
          "Due request created successfully."
        )
      );
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create due request"));
  }
});

// Get all due requests with pending status, driver details, and ride details
export const getAllPendingDueRequests = asyncHandler(async (req, res) => {
  try {
    // Fetch all due requests with pending status
    const dueRequests = await DueRequest.find({ status: "pending" })
      .populate("requestedBy", "name phone driver_photo") // Populate driver fields
      .exec();

    if (dueRequests.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse(200, null, "No pending due requests found"));
    }

    // Format response with additional details for each request
    const formattedDueRequests = await Promise.all(
      dueRequests.map(async (request) => {
        const driver = await Driver.findOne({
          userId: request.requestedBy._id,
        }); // Find driver by userId
        if (!driver) {
          return {
            _id: request._id,
            amount: request.amount,
            requestedAt: request.createdAt,
            status: request.status,
            driver: null,
            rides: null,
            dueAmount: request.dueAmount || null,
            notes: request.notes || "No notes provided",
            paymentMethod: request.paymentMethod || "Unknown",
            paidAmount: request.paidAmount || 0,
            paymentPhoto: request.paymentPhoto || null,
          };
        }

        const khata = await Khata.findOne({ driverId: driver._id }); // Find rides from Khata
        const rideDetails = khata?.due_payment_details || [];

        return {
          _id: request._id,
          amount: request.amount,
          requestedAt: request.createdAt,
          status: request.status,
          driver: {
            name: driver.name || "N/A",
            phone: driver.phone || "N/A",
            photo: driver.driver_photo || null,
          },
          rides: rideDetails, // Include all ride details
          dueAmount: request.dueAmount || null,
          notes: request.notes || "No notes provided",
          paymentMethod: request.paymentMethod || "Unknown",
          paidAmount: request.paidAmount || 0,
          paymentPhoto: request.paymentPhoto || null,
        };
      })
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { dueRequests: formattedDueRequests },
          "All pending due requests fetched successfully."
        )
      );
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch pending due requests"));
  }
});

// Get a due request with driver details populated
export const getDueRequestDetails = asyncHandler(async (req, res) => {
  const { dueRequestId } = req.params;

  try {
    // Find the due request and populate driver details
    const dueRequest = await DueRequest.findById(dueRequestId)
      .populate("requestedBy", "driver_photo phone name franchiseId") // Added franchiseId
      .populate("adminId", "name email phone") // Populate admin details
      .exec();

    if (!dueRequest) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Due request not found"));
    }

    // Find driver by userId
    const driver = await Driver.findOne({
      userId: dueRequest.requestedBy._id,
    });

    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver details not found"));
    }

    // Find Khata for this driver
    const khata = await Khata.findOne({
      driverId: driver._id,
      adminId: dueRequest.adminId,
    });

    // Calculate profits from due_payment_details
    let totalDriverProfit = 0;
    let totalAdminProfit = 0;
    let totalFranchiseProfit = 0;
    let totalAmount = 0;
    let rideCount = 0;

    if (
      khata &&
      khata.due_payment_details &&
      khata.due_payment_details.length > 0
    ) {
      rideCount = khata.due_payment_details.length;

      khata.due_payment_details.forEach((payment) => {
        totalDriverProfit += payment.driver_profit || 0;
        totalAdminProfit += payment.admin_profit || 0;
        totalFranchiseProfit += payment.franchise_profit || 0;
        totalAmount += payment.total_price || 0;
      });
    }

    // Get franchise details if exists
    let franchiseDetails = null;
    if (driver.franchiseId) {
      const Franchise = mongoose.model("Franchise");
      const franchise = await Franchise.findById(driver.franchiseId).select(
        "name phone email total_earning"
      );

      if (franchise) {
        franchiseDetails = {
          id: franchise._id,
          name: franchise.name,
          phone: franchise.phone,
          email: franchise.email,
          totalEarning: franchise.total_earning || 0,
        };
      }
    }

    // Prepare response data
    const responseData = {
      dueRequest: {
        _id: dueRequest._id,
        dueAmount: dueRequest.dueAmount,
        status: dueRequest.status,
        paymentMethod: dueRequest.paymentMethod,
        paidAmount: dueRequest.paidAmount,
        paymentPhoto: dueRequest.paymentPhoto,
        notes: dueRequest.notes,
        createdAt: dueRequest.createdAt,
        resolvedAt: dueRequest.resolvedAt,
        requestedBy: dueRequest.requestedBy
          ? {
              id: dueRequest.requestedBy._id,
              name: dueRequest.requestedBy.name,
              phone: dueRequest.requestedBy.phone,
              photo: dueRequest.requestedBy.driver_photo,
              franchiseId: dueRequest.requestedBy.franchiseId,
            }
          : null,
        admin: dueRequest.adminId
          ? {
              id: dueRequest.adminId._id,
              name: dueRequest.adminId.name,
              email: dueRequest.adminId.email,
              phone: dueRequest.adminId.phone,
            }
          : null,
      },
      profitSummary: {
        totalAmount: totalAmount,
        rideCount: rideCount,
        driverProfit: totalDriverProfit,
        adminProfit: totalAdminProfit,
        franchiseProfit: totalFranchiseProfit,
        breakdown: {
          driverPercentage:
            totalAmount > 0
              ? ((totalDriverProfit / totalAmount) * 100).toFixed(2)
              : 0,
          adminPercentage:
            totalAmount > 0
              ? ((totalAdminProfit / totalAmount) * 100).toFixed(2)
              : 0,
          franchisePercentage:
            totalAmount > 0
              ? ((totalFranchiseProfit / totalAmount) * 100).toFixed(2)
              : 0,
        },
      },
      khataSummary: {
        driverDue: khata?.driverdue || 0,
        adminDue: khata?.admindue || 0,
        franchiseDue: khata?.franchisedue || 0,
        totalDuePayments: khata?.due_payment_details?.length || 0,
      },
      franchise: franchiseDetails,
      driverDetails: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        totalEarning: driver.total_earning || 0,
        dueWallet: driver.due_wallet || 0,
        cashWallet: driver.cash_wallet || 0,
        onlineWallet: driver.online_wallet || 0,
      },
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          "Due request details fetched successfully."
        )
      );
  } catch (error) {
    console.error("Error fetching due request details:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch due request details"));
  }
});

// Update Due Request Status and Update All Parties
export const updateDueRequestStatus = asyncHandler(async (req, res) => {
  const { dueRequestId } = req.params;
  const { status, note, paymentMethod, paymentPhoto } = req.body;

  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      message: "Invalid status. It must be 'approved' or 'rejected'.",
    });
  }

  try {
    // Find the due request by its ID
    const dueRequest = await DueRequest.findById(dueRequestId);

    if (!dueRequest) {
      return res.status(404).json({
        message: "Due request not found.",
      });
    }

    // Find driver and admin
    const driver = await Driver.findOne({ userId: dueRequest.requestedBy });
    const admin = await Admin.findById(dueRequest.adminId);

    if (!driver || !admin) {
      return res.status(404).json({
        message: "Driver or Admin not found.",
      });
    }

    // Find the Khata record
    const khata = await Khata.findOne({
      driverId: driver._id,
      adminId: admin._id,
    });

    if (!khata) {
      return res.status(404).json({
        message: "Khata record not found for this driver-admin pair.",
      });
    }

    // Handle "approved" status
    if (status === "approved") {
      // Check if admin has sufficient balance in their due wallet
      if (admin.due_wallet < dueRequest.dueAmount) {
        return res.status(400).json({
          message: "Admin does not have sufficient balance in due wallet.",
        });
      }

      // Calculate totals from due_payment_details
      let totalDriverProfit = 0;
      let totalAdminProfit = 0;
      let totalFranchiseProfit = 0;

      khata.due_payment_details.forEach((payment) => {
        totalDriverProfit += payment.driver_profit || 0;
        totalAdminProfit += payment.admin_profit || 0;
        totalFranchiseProfit += payment.franchise_profit || 0;
      });

      console.log("Calculated Profits:", {
        driver: totalDriverProfit,
        admin: totalAdminProfit,
        franchise: totalFranchiseProfit,
        totalDue: dueRequest.dueAmount,
      });

      // 1. UPDATE DRIVER
      driver.total_earning += totalDriverProfit;
      driver.due_wallet -= dueRequest.dueAmount;
      if (driver.due_wallet < 0) driver.due_wallet = 0;

      // 2. UPDATE ADMIN
      admin.due_wallet -= dueRequest.dueAmount;
      if (admin.due_wallet < 0) admin.due_wallet = 0;
      admin.total_earning += totalAdminProfit;

      // 3. UPDATE FRANCHISE (if exists)
      let franchiseUpdate = null;
      if (driver.franchiseId && totalFranchiseProfit > 0) {
        const franchise = await Franchise.findById(driver.franchiseId);

        if (franchise) {
          franchise.total_earning =
            (franchise.total_earning || 0) + totalFranchiseProfit;
          franchise.due_wallet =
            (franchise.due_wallet || 0) + totalFranchiseProfit;
          await franchise.save();

          franchiseUpdate = {
            franchiseId: franchise._id,
            amountAdded: totalFranchiseProfit,
            newTotalEarning: franchise.total_earning,
          };
        }
      }

      // 4. CLEAR ALL DUES FROM KHATA
      khata.driverdue = 0; // Clear driver due
      khata.admindue = 0; // Clear admin due
      khata.franchisedue = 0; // Clear franchise due

      // 5. REMOVE ALL DUE PAYMENT DETAILS
      khata.due_payment_details = [];

      // Save updated Khata
      await khata.save();

      // Update the due request
      dueRequest.status = "approved";
      dueRequest.resolvedAt = new Date();
      dueRequest.paidAmount = dueRequest.dueAmount;
      dueRequest.paymentDate = new Date();
      dueRequest.paymentMethod = paymentMethod || "cash";
      dueRequest.paymentPhoto = paymentPhoto;

      if (note) {
        dueRequest.notes = note;
      }
    } else if (status === "rejected") {
      // Handle rejection
      dueRequest.status = "rejected";
      dueRequest.notes = note || "No rejection reason provided";
      dueRequest.resolvedAt = new Date();
    }

    // Save all updates
    await dueRequest.save();
    await driver.save();
    await admin.save();

    return res.status(200).json({
      message: "Due request processed successfully.",
      data: {
        driver: {
          id: driver._id,
          name: driver.name,
          totalEarning: driver.total_earning,
          dueWallet: driver.due_wallet,
        },
        admin: {
          id: admin._id,
          name: admin.name,
          totalEarning: admin.total_earning,
          dueWallet: admin.due_wallet,
        },
        khata: {
          driverdue: khata.driverdue,
          admindue: khata.admindue,
          franchisedue: khata.franchisedue,
          duePaymentsCount: khata.due_payment_details.length,
        },
        franchise: franchiseUpdate || { message: "No franchise involved" },
      },
    });
  } catch (error) {
    console.error("Error updating due request status:", error);
    return res.status(500).json({
      message: "Failed to update due request status.",
      error: error.message,
    });
  }
});

// Delete Due Request and Update Driver/Admin Wallets
export const deleteDueRequest = asyncHandler(async (req, res) => {
  const { dueRequestId } = req.params;

  try {
    // Find the due request by its ID
    const dueRequest = await DueRequest.findById(dueRequestId);

    if (!dueRequest) {
      return res.status(404).json({
        message: "Due request not found.",
      });
    }

    // Handle the case where the due request is approved
    if (dueRequest.status === "approved") {
      const driver = await Driver.findById(dueRequest.requestedBy);
      const admin = await Admin.findById(dueRequest.resolvedBy);

      if (!driver || !admin) {
        return res.status(404).json({
          message: "Driver or Admin not found.",
        });
      }

      // If the request is approved, reverse the updates done to the driver and admin wallets
      driver.due_wallet += dueRequest.dueAmount; // Restore the driver's due wallet
      driver.total_earning -= dueRequest.dueAmount; // Subtract from driver's total earnings

      admin.due_wallet += dueRequest.dueAmount; // Restore the admin's due wallet
      admin.total_earning -= dueRequest.dueAmount; // Subtract from admin's total earnings

      // Save the updated driver and admin details
      await driver.save();
      await admin.save();
    }

    // Delete the due request
    await DueRequest.findByIdAndDelete(dueRequestId);

    return res.status(200).json({
      message: "Due request deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting due request:", error.message);
    return res.status(500).json({
      message: "Failed to delete due request.",
    });
  }
});
