import mongoose from "mongoose";
import { Admin } from "../models/admin.model.js";
import { Driver } from "../models/driver.model.js";
import { DueRequest } from "../models/dueRequest.model.js";
import { Khata } from "../models/khata.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { Franchise } from "../models/franchise.model.js";
import { RideDetails } from "../models/rideDetails.model.js";

// ============================================
// HELPER FUNCTIONS
// ============================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ============================================
// CREATE DUE REQUEST (For Drivers)
// ============================================
export const createDueRequest = asyncHandler(async (req, res) => {
  const {
    driverId,
    dueAmount,
    notes,
    paymentMethod = "cash",
    paymentPhoto,
  } = req.body;

  try {
    // Validate required fields
    if (!driverId || !dueAmount || !paymentPhoto) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Missing required fields"));
    }

    // Validate ObjectId
    if (!isValidObjectId(driverId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid driver ID format"));
    }

    // Check if driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Get admin (assuming there's one admin)
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

    // Check if driver already has pending due request
    const existingPendingRequest = await DueRequest.findOne({
      requestedBy: driverId,
      requestedByModel: "Driver",
      status: "pending",
    });

    if (existingPendingRequest) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "You already have a pending due request. Please wait for approval."
          )
        );
    }

    // Check if dueAmount is valid (should be <= driver's due_wallet)
    if (dueAmount > driver.due_wallet) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Requested amount (${dueAmount}) exceeds your due balance (${driver.due_wallet})`
          )
        );
    }

    // Create a new due request
    const newDueRequest = new DueRequest({
      requestedBy: driverId,
      requestedByModel: "Driver",
      adminId: admin._id,
      franchiseId: driver.franchiseId || null,
      dueAmount,
      payableAmount: dueAmount,
      requestType: "driver_due",
      status: "pending",
      notes: notes || "",
      paymentMethod,
      paymentPhoto,
      // Track who can approve
      approvalLevel: driver.franchiseId ? "franchise_first" : "admin_only",
      approvedByFranchise: false,
      approvedByAdmin: false,
    });

    await newDueRequest.save();

    // Respond with success
    return res.status(201).json(
      new ApiResponse(
        201,
        {
          dueRequest: newDueRequest,
          driver: {
            name: driver.name,
            phone: driver.phone,
            dueWallet: driver.due_wallet,
            franchise: driver.franchiseId ? "Yes" : "No",
          },
        },
        "Due request created successfully."
      )
    );
  } catch (error) {
    console.error("Error creating due request:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create due request"));
  }
});

// ============================================
// GET DUE REQUESTS FOR APPROVER
// ============================================
export const getDueRequestsForApprover = asyncHandler(async (req, res) => {
  const { userId, userRole } = req.user; // Assuming user info from auth middleware
  const { status, type } = req.query;

  try {
    let query = {};

    // Admin can see all due requests
    if (userRole === "admin") {
      query = {};
    }
    // Franchise can only see requests from their drivers
    else if (userRole === "franchise") {
      const franchise = await Franchise.findOne({ userId });
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      query = {
        franchiseId: franchise._id,
        requestedByModel: "Driver",
      };
    }
    // Driver can only see their own requests
    else if (userRole === "driver") {
      const driver = await Driver.findOne({ userId });
      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      query = {
        requestedBy: driver._id,
        requestedByModel: "Driver",
      };
    } else {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Unauthorized access"));
    }

    // Apply status filter
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }

    // Apply type filter
    if (type && ["driver_due", "franchise_weekly_bill"].includes(type)) {
      query.requestType = type;
    }

    // Get due requests with population
    const dueRequests = await DueRequest.find(query)
      .populate({
        path: "requestedBy",
        select: "name phone email driver_photo",
        model: function () {
          return this.requestedByModel === "Driver" ? "Driver" : "Franchise";
        },
      })
      .populate("adminId", "name email phone")
      .populate("franchiseId", "name phone email")
      .populate("resolvedBy", "name email")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });

    // Format response
    const formattedRequests = dueRequests.map((request) => ({
      _id: request._id,
      requestType: request.requestType,
      status: request.status,
      dueAmount: request.dueAmount,
      payableAmount: request.payableAmount,
      createdAt: request.createdAt,
      requester: request.requestedBy
        ? {
            id: request.requestedBy._id,
            name: request.requestedBy.name,
            phone: request.requestedBy.phone,
            type: request.requestedByModel,
          }
        : null,
      franchise: request.franchiseId
        ? {
            id: request.franchiseId._id,
            name: request.franchiseId.name,
          }
        : null,
      admin: request.adminId
        ? {
            id: request.adminId._id,
            name: request.adminId.name,
          }
        : null,
      approvalInfo: {
        approvedByFranchise: request.approvedByFranchise,
        approvedByAdmin: request.approvedByAdmin,
        approvalLevel: request.approvalLevel,
      },
      notes: request.notes,
      paymentMethod: request.paymentMethod,
      paymentPhoto: request.paymentPhoto,
      // Weekly bill specific
      weekStartDate: request.weekStartDate,
      weekEndDate: request.weekEndDate,
      totalGeneratedAmount: request.totalGeneratedAmount,
    }));

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          requests: formattedRequests,
          total: formattedRequests.length,
          userRole,
        },
        "Due requests fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching due requests:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch due requests"));
  }
});

// ============================================
// APPROVE DUE REQUEST
// ============================================
export const approveDueRequest = asyncHandler(async (req, res) => {
  const { dueRequestId } = req.params;
  const { userId, userRole } = req.user;
  const { note, paymentMethod, paymentPhoto } = req.body;

  try {
    // Validate ID
    if (!isValidObjectId(dueRequestId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid due request ID"));
    }

    // Find the due request
    const dueRequest = await DueRequest.findById(dueRequestId)
      .populate("requestedBy")
      .populate("franchiseId");

    if (!dueRequest) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Due request not found"));
    }

    // Check if already approved/rejected
    if (dueRequest.status !== "pending") {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "This request has already been processed")
        );
    }

    // Authorization check
    let approver = null;
    let approverRole = "";

    if (userRole === "admin") {
      approver = await Admin.findOne({ userId });
      approverRole = "admin";
    } else if (userRole === "franchise") {
      approver = await Franchise.findOne({ userId });
      approverRole = "franchise";
      
      // Franchise can only approve requests from their drivers
      if (!dueRequest.franchiseId || 
          !dueRequest.franchiseId._id.equals(approver._id)) {
        return res
          .status(403)
          .json(new ApiResponse(403, null, "Not authorized to approve this request"));
      }
    } else {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Unauthorized to approve requests"));
    }

    if (!approver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Approver not found"));
    }

    // Process based on request type
    if (dueRequest.requestType === "driver_due") {
      await processDriverDueApproval(
        dueRequest,
        approver,
        approverRole,
        userRole,
        note,
        paymentMethod,
        paymentPhoto
      );
    } else if (dueRequest.requestType === "franchise_weekly_bill") {
      await processFranchiseWeeklyBillApproval(
        dueRequest,
        approver,
        approverRole,
        note,
        paymentMethod,
        paymentPhoto
      );
    }

    // Update request status
    if (userRole === "franchise") {
      dueRequest.approvedByFranchise = true;
      dueRequest.franchiseApprovedAt = new Date();
      dueRequest.franchiseApprovedBy = approver._id;
      
      // If franchise approved and driver has no franchise, mark as approved
      if (!dueRequest.franchiseId) {
        dueRequest.status = "approved";
        dueRequest.approvedByAdmin = true;
        dueRequest.adminApprovedAt = new Date();
        dueRequest.approvedBy = approver._id;
      }
    } else if (userRole === "admin") {
      dueRequest.approvedByAdmin = true;
      dueRequest.adminApprovedAt = new Date();
      dueRequest.approvedBy = approver._id;
      
      // Mark as approved if franchise already approved or no franchise
      if (dueRequest.approvedByFranchise || !dueRequest.franchiseId) {
        dueRequest.status = "approved";
      }
    }

    // If both approvals are done, mark as approved
    if (dueRequest.approvedByFranchise && dueRequest.approvedByAdmin) {
      dueRequest.status = "approved";
    }

    dueRequest.resolvedAt = new Date();
    if (note) dueRequest.notes = note;
    if (paymentMethod) dueRequest.paymentMethod = paymentMethod;
    if (paymentPhoto) dueRequest.paymentPhoto = paymentPhoto;
    dueRequest.paidAmount = dueRequest.payableAmount;
    dueRequest.paymentDate = new Date();

    await dueRequest.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { dueRequest },
          `Due request ${dueRequest.status} successfully`
        )
      );
  } catch (error) {
    console.error("Error approving due request:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to approve due request"));
  }
});

// ============================================
// PROCESS DRIVER DUE APPROVAL
// ============================================
async function processDriverDueApproval(
  dueRequest,
  approver,
  approverRole,
  userRole,
  note,
  paymentMethod,
  paymentPhoto
) {
  const driver = await Driver.findById(dueRequest.requestedBy);
  if (!driver) {
    throw new Error("Driver not found");
  }

  const admin = await Admin.findById(dueRequest.adminId);
  if (!admin) {
    throw new Error("Admin not found");
  }

  // Find the Khata record
  const khata = await Khata.findOne({
    driverId: driver._id,
    adminId: admin._id,
  });

  if (!khata) {
    throw new Error("Khata record not found");
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

  // Update based on who is approving
  if (userRole === "admin") {
    // Admin approving - update all balances immediately
    await updateBalancesAfterApproval(
      driver,
      admin,
      khata,
      dueRequest,
      totalDriverProfit,
      totalAdminProfit,
      totalFranchiseProfit
    );
  } else if (userRole === "franchise") {
    // Franchise approving - just mark as approved by franchise
    // Actual balance updates happen when admin approves
    console.log(`Franchise ${approver.name} approved driver ${driver.name}'s request`);
  }
}

// ============================================
// UPDATE BALANCES AFTER APPROVAL
// ============================================
async function updateBalancesAfterApproval(
  driver,
  admin,
  khata,
  dueRequest,
  totalDriverProfit,
  totalAdminProfit,
  totalFranchiseProfit
) {
  // 1. UPDATE DRIVER
  driver.total_earning += totalDriverProfit;
  driver.due_wallet -= dueRequest.dueAmount;
  if (driver.due_wallet < 0) driver.due_wallet = 0;

  // 2. UPDATE ADMIN
  admin.due_wallet -= dueRequest.dueAmount;
  if (admin.due_wallet < 0) admin.due_wallet = 0;
  admin.total_earning += totalAdminProfit;

  // 3. UPDATE FRANCHISE (if exists)
  if (driver.franchiseId && totalFranchiseProfit > 0) {
    const franchise = await Franchise.findById(driver.franchiseId);
    if (franchise) {
      // Accumulate franchise profit in their due_wallet
      franchise.due_wallet = (franchise.due_wallet || 0) + totalFranchiseProfit;
      // Also add to total_earnings
      franchise.total_earnings = (franchise.total_earnings || 0) + totalFranchiseProfit;
      
      // Track accumulated admin profit for weekly billing
      if (!franchise.accumulatedAdminProfit) {
        franchise.accumulatedAdminProfit = 0;
      }
      franchise.accumulatedAdminProfit += totalAdminProfit;
      
      // Track weekly accumulation
      const currentWeek = getWeekNumber(new Date());
      if (!franchise.weeklyAccumulations) {
        franchise.weeklyAccumulations = {};
      }
      if (!franchise.weeklyAccumulations[currentWeek]) {
        franchise.weeklyAccumulations[currentWeek] = {
          adminProfit: 0,
          franchiseProfit: 0,
          totalRides: 0,
        };
      }
      franchise.weeklyAccumulations[currentWeek].adminProfit += totalAdminProfit;
      franchise.weeklyAccumulations[currentWeek].franchiseProfit += totalFranchiseProfit;
      franchise.weeklyAccumulations[currentWeek].totalRides += 1;
      
      await franchise.save();
    }
  }

  // 4. CLEAR ALL DUES FROM KHATA
  khata.driverdue = 0;
  khata.admindue = 0;
  khata.franchisedue = 0;
  khata.due_payment_details = [];

  await khata.save();
  await driver.save();
  await admin.save();
}

// ============================================
// PROCESS FRANCHISE WEEKLY BILL APPROVAL
// ============================================
async function processFranchiseWeeklyBillApproval(
  dueRequest,
  approver,
  approverRole,
  note,
  paymentMethod,
  paymentPhoto
) {
  if (approverRole !== "admin") {
    throw new Error("Only admin can approve franchise weekly bills");
  }

  const franchise = await Franchise.findById(dueRequest.franchiseId);
  if (!franchise) {
    throw new Error("Franchise not found");
  }

  const admin = await Admin.findById(dueRequest.adminId);
  if (!admin) {
    throw new Error("Admin not found");
  }

  // Check if franchise has sufficient balance
  if (franchise.due_wallet < dueRequest.payableAmount) {
    throw new Error(
      "Franchise does not have sufficient balance to pay weekly bill."
    );
  }

  // Process payment: Franchise → Admin
  // Deduct from franchise's due wallet (admin's commission)
  franchise.due_wallet -= dueRequest.payableAmount;
  
  // Clear accumulated admin profit for this period
  if (franchise.accumulatedAdminProfit) {
    franchise.accumulatedAdminProfit = Math.max(
      0,
      franchise.accumulatedAdminProfit - dueRequest.payableAmount
    );
  }
  
  await franchise.save();

  // Add to admin's total earnings
  admin.total_earning += dueRequest.adminCommissionAmount;
  await admin.save();
}

// ============================================
// GENERATE WEEKLY BILL FOR FRANCHISE
// ============================================
export const generateWeeklyBill = asyncHandler(async (req, res) => {
  const { franchiseId, weekStartDate, weekEndDate } = req.body;
  const { userId, userRole } = req.user;

  // Only admin can generate weekly bills
  if (userRole !== "admin") {
    return res
      .status(403)
      .json(new ApiResponse(403, null, "Only admin can generate weekly bills"));
  }

  try {
    // Validate required fields
    if (!franchiseId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Franchise ID is required"));
    }

    // Get admin
    const admin = await Admin.findOne({ userId });
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Get franchise
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Calculate date range
    const startDate = weekStartDate ? new Date(weekStartDate) : getWeekStartDate();
    const endDate = weekEndDate ? new Date(weekEndDate) : getWeekEndDate(startDate);

    // Get all approved driver due requests for this franchise in the period
    const approvedDriverRequests = await DueRequest.find({
      franchiseId: franchiseId,
      requestType: "driver_due",
      status: "approved",
      adminApprovedAt: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    if (approvedDriverRequests.length === 0) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "No approved driver due requests found for this period"
          )
        );
    }

    // Calculate totals from approved requests
    let totalAdminProfit = 0;
    let totalFranchiseProfit = 0;
    let totalGeneratedAmount = 0;

    // Also get rides for detailed calculation
    const weeklyRides = await RideDetails.find({
      franchiseId: franchiseId,
      isRide_ended: true,
      isPayment_done: true,
      ride_end_time: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    if (weeklyRides.length > 0) {
      totalGeneratedAmount = weeklyRides.reduce(
        (sum, ride) => sum + ride.total_amount,
        0
      );
      totalAdminProfit = weeklyRides.reduce(
        (sum, ride) => sum + ride.admin_profit,
        0
      );
      totalFranchiseProfit = weeklyRides.reduce(
        (sum, ride) => sum + ride.franchise_profit,
        0
      );
    } else {
      // Fallback to approved requests if rides not found
      totalAdminProfit = approvedDriverRequests.reduce(
        (sum, req) => sum + (req.adminCommissionAmount || 0),
        0
      );
      totalGeneratedAmount = approvedDriverRequests.reduce(
        (sum, req) => sum + (req.totalGeneratedAmount || 0),
        0
      );
    }

    // Check if a bill already exists for this period
    const existingBill = await DueRequest.findOne({
      franchiseId: franchiseId,
      requestType: "franchise_weekly_bill",
      weekStartDate: startDate,
      weekEndDate: endDate,
      status: { $in: ["pending", "approved"] },
    });

    if (existingBill) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            { existingBill },
            "A bill already exists for this period"
          )
        );
    }

    // Create weekly bill due request (from franchise to admin)
    const weeklyBillRequest = new DueRequest({
      requestedBy: franchiseId,
      requestedByModel: "Franchise",
      adminId: admin._id,
      franchiseId: franchiseId,
      requestType: "franchise_weekly_bill",
      dueAmount: totalAdminProfit,
      payableAmount: totalAdminProfit,
      status: "pending",
      weekStartDate: startDate,
      weekEndDate: endDate,
      totalGeneratedAmount: totalGeneratedAmount,
      franchiseCommissionAmount: totalFranchiseProfit,
      adminCommissionAmount: totalAdminProfit,
      notes: `Weekly bill for ${startDate.toDateString()} to ${endDate.toDateString()}`,
      paymentMethod: "online",
      approvalLevel: "admin_only", // Only admin can approve franchise bills
      approvedByFranchise: false,
      approvedByAdmin: false,
    });

    await weeklyBillRequest.save();

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          bill: weeklyBillRequest,
          summary: {
            period: `${startDate.toDateString()} to ${endDate.toDateString()}`,
            totalRides: weeklyRides.length,
            approvedRequests: approvedDriverRequests.length,
            totalGeneratedAmount,
            totalAdminProfit,
            totalFranchiseProfit,
          },
          franchise: {
            id: franchise._id,
            name: franchise.name,
            dueWallet: franchise.due_wallet || 0,
            accumulatedAdminProfit: franchise.accumulatedAdminProfit || 0,
          },
        },
        "Weekly bill generated successfully"
      )
    );
  } catch (error) {
    console.error("Error generating weekly bill:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to generate weekly bill"));
  }
});

// ============================================
// FRANCHISE CREATES DUE REQUEST TO ADMIN (For Weekly Bill Payment)
// ============================================
export const createFranchiseDueRequest = asyncHandler(async (req, res) => {
  const { franchiseId, dueAmount, notes, paymentMethod, paymentPhoto } = req.body;
  const { userId, userRole } = req.user;

  // Only franchise can create this type of request
  if (userRole !== "franchise") {
    return res
      .status(403)
      .json(new ApiResponse(403, null, "Only franchise can create this request"));
  }

  try {
    // Get franchise
    const franchise = await Franchise.findOne({ userId });
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Get admin
    const admin = await Admin.findOne();
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Check if franchise has a pending weekly bill
    const pendingWeeklyBill = await DueRequest.findOne({
      requestedBy: franchise._id,
      requestedByModel: "Franchise",
      requestType: "franchise_weekly_bill",
      status: "pending",
    });

    if (!pendingWeeklyBill) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "No pending weekly bill found. Please generate a weekly bill first."
          )
        );
    }

    // Check if dueAmount matches the pending bill
    if (dueAmount !== pendingWeeklyBill.payableAmount) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Amount must be exactly ${pendingWeeklyBill.payableAmount} to pay the weekly bill`
          )
        );
    }

    // Check if franchise has sufficient balance
    if (franchise.due_wallet < dueAmount) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Insufficient balance. Available: ${franchise.due_wallet}, Required: ${dueAmount}`
          )
        );
    }

    // Update the existing weekly bill with payment details
    pendingWeeklyBill.paymentMethod = paymentMethod || "online";
    pendingWeeklyBill.paymentPhoto = paymentPhoto;
    pendingWeeklyBill.notes = notes || pendingWeeklyBill.notes;
    pendingWeeklyBill.status = "pending"; // Still needs admin approval

    await pendingWeeklyBill.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          dueRequest: pendingWeeklyBill,
          franchise: {
            name: franchise.name,
            dueWallet: franchise.due_wallet,
          },
        },
        "Payment request submitted for weekly bill. Waiting for admin approval."
      )
    );
  } catch (error) {
    console.error("Error creating franchise due request:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create payment request"));
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${weekNo}`;
}

function getWeekStartDate(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEndDate(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
}

// ============================================
// GET DUE REQUEST STATISTICS
// ============================================
export const getDueRequestStatistics = asyncHandler(async (req, res) => {
  const { userId, userRole } = req.user;
  const { startDate, endDate } = req.query;

  try {
    let matchQuery = {};
    let franchiseId = null;

    // Apply user role filters
    if (userRole === "franchise") {
      const franchise = await Franchise.findOne({ userId });
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }
      franchiseId = franchise._id;
      matchQuery.franchiseId = franchise._id;
    }

    // Date filter
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchQuery.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    }

    // Get statistics
    const stats = await DueRequest.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            requestType: "$requestType",
            status: "$status",
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$dueAmount" },
          avgAmount: { $avg: "$dueAmount" },
        },
      },
    ]);

    // Get franchise-specific stats if franchise
    let franchiseStats = null;
    if (franchiseId) {
      const franchise = await Franchise.findById(franchiseId);
      franchiseStats = {
        totalEarnings: franchise.total_earnings || 0,
        dueWallet: franchise.due_wallet || 0,
        accumulatedAdminProfit: franchise.accumulatedAdminProfit || 0,
        totalDrivers: franchise.total_drivers || 0,
      };
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          statistics: stats,
          franchiseStats,
          userRole,
        },
        "Statistics fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching statistics:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch statistics"));
  }
});