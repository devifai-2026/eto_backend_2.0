import mongoose from "mongoose";
import { Admin } from "../models/admin.model.js";
import { Driver } from "../models/driver.model.js";
import { DueRequest } from "../models/dueRequest.model.js";
import { Khata } from "../models/khata.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { Franchise } from "../models/franchise.model.js";
import { WeeklyBill } from "../models/weeklyBill.model.js";

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

    // Validate ObjectIds
    if (!isValidObjectId(driverId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid ID format"));
    }

    // Check if driver exists
    const driver = await Driver.findOne({ userId: driverId });
    if (!driver) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Driver not found"));
    }

    // Check if admin exists
    const admin = await Admin.findOne();
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Check if driver already has pending due request
    const existingPendingRequest = await DueRequest.findOne({
      requestedBy: driver._id,
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
      requestedBy: driver._id,
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

    await Driver.updateOne(
      { _id: driver._id },
      { $set: { hasDueRequest: true } }
    );

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
  const { userId, userType, adminId, franchiseId, driverId } = req.query;

  try {
    let query = {};

    // Admin can see all due requests
    if (userType === "admin") {
      if (!adminId) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Admin ID is required"));
      }

      if (!isValidObjectId(adminId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid admin ID format"));
      }

      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      query = { adminId: admin._id };
    }
    // Franchise can only see requests from their drivers
    else if (userType === "franchise") {
      if (!franchiseId) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Franchise ID is required"));
      }

      if (!isValidObjectId(franchiseId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid franchise ID format"));
      }

      const franchise = await Franchise.findById(franchiseId);
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
    else if (userType === "driver") {
      if (!driverId) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Driver ID is required"));
      }

      if (!isValidObjectId(driverId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid driver ID format"));
      }

      const driver = await Driver.findById(driverId);
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
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user type"));
    }

    // Apply filters
    const { status, type } = req.query;

    // Apply status filter
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }

    // Apply type filter
    if (type && ["driver_due", "franchise_weekly_bill"].includes(type)) {
      query.requestType = type;
    }

    // Get due requests without dynamic populate first
    const dueRequests = await DueRequest.find(query)
      .populate({
        path: "requestedBy",
        select: "name phone email driver_photo",
      })
      .populate("adminId", "name email phone")
      .populate("franchiseId", "name phone email")
      .populate("resolvedBy", "name email")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });

    // Format response
    const formattedRequests = dueRequests.map((request) => {
      let requester = null;

      // Handle requester based on requestedByModel
      if (request.requestedBy) {
        requester = {
          id: request.requestedBy._id,
          name: request.requestedBy.name || "No Name",
          phone: request.requestedBy.phone || "No Phone",
          type: request.requestedByModel,
        };

        // Add driver specific fields
        if (request.requestedByModel === "Driver") {
          requester.driver_photo = request.requestedBy.driver_photo;
        }
      }

      return {
        _id: request._id,
        requestType: request.requestType,
        status: request.status,
        dueAmount: request.dueAmount,
        payableAmount: request.payableAmount,
        createdAt: request.createdAt,
        requester: requester,
        franchise: request.franchiseId
          ? {
              id: request.franchiseId._id,
              name: request.franchiseId.name || "No Name",
            }
          : null,
        admin: request.adminId
          ? {
              id: request.adminId._id,
              name: request.adminId.name || "No Name",
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
      };
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          requests: formattedRequests,
          total: formattedRequests.length,
          userType,
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
  const { approverId, userType, note, paymentMethod, paymentPhoto } = req.body;

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

    // Validate approverId based on userType
    if (!approverId || !userType) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Approver ID and user type are required")
        );
    }

    // Authorization check
    let approver = null;

    if (userType === "admin") {
      if (!isValidObjectId(approverId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid admin ID format"));
      }

      approver = await Admin.findById(approverId);
      if (!approver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }
    } else if (userType === "franchise") {
      if (!isValidObjectId(approverId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid franchise ID format"));
      }

      approver = await Franchise.findById(approverId);
      if (!approver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      // Franchise can only approve requests from their drivers
      if (
        !dueRequest.franchiseId ||
        !dueRequest.franchiseId._id.equals(approver._id)
      ) {
        return res
          .status(403)
          .json(
            new ApiResponse(403, null, "Not authorized to approve this request")
          );
      }
    } else {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Unauthorized to approve requests"));
    }

    // Process based on request type
    if (dueRequest.requestType === "driver_due") {
      await processDriverDueApproval(
        dueRequest,
        approver,
        userType,
        note,
        paymentMethod,
        paymentPhoto
      );
    } else if (dueRequest.requestType === "franchise_weekly_bill") {
      await processFranchiseWeeklyBillApproval(
        dueRequest,
        approver,
        userType,
        note,
        paymentMethod,
        paymentPhoto
      );
    }

    // UPDATE: Single approval system - any approver can approve
    if (userType === "franchise") {
      dueRequest.approvedByFranchise = true;
      dueRequest.franchiseApprovedAt = new Date();
      dueRequest.franchiseApprovedBy = approver._id;
      // UPDATE: Mark as approved immediately
      dueRequest.status = "approved";
      dueRequest.approvedByAdmin = true; // Consider it admin approved too
      dueRequest.adminApprovedAt = new Date();
      dueRequest.approvedBy = approver._id;
    } else if (userType === "admin") {
      dueRequest.approvedByAdmin = true;
      dueRequest.adminApprovedAt = new Date();
      dueRequest.approvedBy = approver._id;
      // UPDATE: Mark as approved immediately
      dueRequest.status = "approved";
      // If driver has franchise, also mark franchise approval
      if (dueRequest.franchiseId) {
        dueRequest.approvedByFranchise = true;
        dueRequest.franchiseApprovedAt = new Date();
        dueRequest.franchiseApprovedBy = approver._id;
      }
    }

    // UPDATE: Remove the dual approval checks
    // if (dueRequest.approvedByFranchise && dueRequest.approvedByAdmin) {
    //   dueRequest.status = "approved";
    // }

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
          `Due request approved successfully by ${userType}`
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
  userType,
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

  // UPDATE: For single approval system, update balances immediately for both franchise and admin
  await updateBalancesAfterApproval(
    driver,
    admin,
    khata,
    dueRequest,
    totalDriverProfit,
    totalAdminProfit,
    totalFranchiseProfit
  );
  await Driver.updateOne(
    { _id: driver._id },
    { $set: { hasDueRequest: false } }
  );
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
      franchise.total_earnings =
        (franchise.total_earnings || 0) + totalFranchiseProfit;

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
      franchise.weeklyAccumulations[currentWeek].adminProfit +=
        totalAdminProfit;
      franchise.weeklyAccumulations[currentWeek].franchiseProfit +=
        totalFranchiseProfit;
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
  userType,
  note,
  paymentMethod,
  paymentPhoto
) {
  if (userType !== "admin") {
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

// ============================================
// GET DUE REQUEST STATISTICS
// ============================================
export const getDueRequestStatistics = asyncHandler(async (req, res) => {
  const { userType, adminId, franchiseId, driverId, startDate, endDate } =
    req.query;

  try {
    let matchQuery = {};

    // Apply user type filters
    if (userType === "admin") {
      if (!adminId) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Admin ID is required"));
      }

      if (!isValidObjectId(adminId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid admin ID format"));
      }

      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Admin not found"));
      }

      matchQuery.adminId = admin._id;
    } else if (userType === "franchise") {
      if (!franchiseId) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Franchise ID is required"));
      }

      if (!isValidObjectId(franchiseId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid franchise ID format"));
      }

      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Franchise not found"));
      }

      matchQuery.franchiseId = franchise._id;
    } else if (userType === "driver") {
      if (!driverId) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Driver ID is required"));
      }

      if (!isValidObjectId(driverId)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid driver ID format"));
      }

      const driver = await Driver.findById(driverId);
      if (!driver) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Driver not found"));
      }

      matchQuery.requestedBy = driver._id;
      matchQuery.requestedByModel = "Driver";
    } else {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid user type"));
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
    if (franchiseId && isValidObjectId(franchiseId)) {
      const franchise = await Franchise.findById(franchiseId);
      if (franchise) {
        franchiseStats = {
          totalEarnings: franchise.total_earnings || 0,
          dueWallet: franchise.due_wallet || 0,
          accumulatedAdminProfit: franchise.accumulatedAdminProfit || 0,
          totalDrivers: franchise.total_drivers || 0,
        };
      }
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          statistics: stats,
          franchiseStats,
          userType,
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

// ============================================
// GET FRANCHISE PENDING BILLS (For Manual Due Request Creation)
// ============================================
export const getFranchisePendingBills = asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;

  try {
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Get auto-generated bills that need manual due request creation
    const pendingBills = await WeeklyBill.find({
      franchiseId: franchise._id,
      isAutoGenerated: true,
      dueRequestCreated: false,
      status: "generated",
    })
      .sort({ createdAt: -1 })
      .populate("adminId", "name email");

    // Format bills for frontend
    const formattedBills = pendingBills.map((bill) => ({
      id: bill._id,
      billNumber: `BILL-${bill._id.toString().slice(-8).toUpperCase()}`,
      period: `${bill.weekStartDate.toLocaleDateString()} - ${bill.weekEndDate.toLocaleDateString()}`,
      weekStartDate: bill.weekStartDate,
      weekEndDate: bill.weekEndDate,
      dueAmount: bill.dueAmount,
      generatedAt: bill.createdAt,
      summary: {
        totalGeneratedAmount: bill.totalGeneratedAmount,
        adminCommission: bill.adminCommissionAmount,
        franchiseCommission: bill.franchiseCommissionAmount,
      },
      canCreateDueRequest: franchise.due_wallet >= bill.dueAmount,
      insufficientBalance: franchise.due_wallet < bill.dueAmount,
      availableBalance: franchise.due_wallet,
      notes: bill.notes,
    }));

    // Get already created due requests for these bills
    const existingDueRequests = await DueRequest.find({
      franchiseId: franchise._id,
      weeklyBillId: { $in: pendingBills.map((b) => b._id) },
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: {
            id: franchise._id,
            name: franchise.name,
            phone: franchise.phone,
            dueWallet: franchise.due_wallet,
            totalEarnings: franchise.total_earnings,
            nextBillDate: franchise.nextBillGenerationDate,
          },
          pendingBills: formattedBills,
          summary: {
            totalBills: formattedBills.length,
            totalDueAmount: formattedBills.reduce(
              (sum, bill) => sum + bill.dueAmount,
              0
            ),
            payableBills: formattedBills.filter((b) => b.canCreateDueRequest)
              .length,
            payableAmount: formattedBills
              .filter((b) => b.canCreateDueRequest)
              .reduce((sum, bill) => sum + bill.dueAmount, 0),
            existingDueRequests: existingDueRequests.length,
          },
          instructions: [
            "1. Bills are auto-generated every week",
            "2. You need to manually create due request for each bill",
            "3. Admin will approve your payment request",
            "4. Ensure sufficient balance in your due wallet",
          ],
        },
        "Pending bills fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching pending bills:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch pending bills"));
  }
});

// ============================================
// FRANCHISE CREATES DUE REQUEST FROM AUTO-GENERATED BILL
// ============================================
export const createFranchiseDueRequest = asyncHandler(async (req, res) => {
  const { billId, paymentMethod = "online", paymentPhoto, notes } = req.body;
  const { franchiseId } = req.params; // From URL params

  try {
    // Validate
    if (!billId || !franchiseId) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Bill ID and Franchise ID are required")
        );
    }

    // Check IDs
    if (!isValidObjectId(billId) || !isValidObjectId(franchiseId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid ID format"));
    }

    // Get franchise
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Get the auto-generated bill
    const bill = await WeeklyBill.findById(billId);
    if (!bill) {
      return res.status(404).json(new ApiResponse(404, null, "Bill not found"));
    }

    // Check if bill belongs to this franchise
    if (!bill.franchiseId.equals(franchise._id)) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "This bill does not belong to your franchise"
          )
        );
    }

    // Check if bill already has a due request
    if (bill.dueRequestCreated) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "A due request already exists for this bill"
          )
        );
    }

    // Check bill status
    if (bill.status !== "generated") {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Cannot create due request for bill with status: ${bill.status}`
          )
        );
    }

    // Check if franchise has sufficient balance
    if (franchise.due_wallet < bill.dueAmount) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Insufficient balance. Available: ₹${franchise.due_wallet}, Required: ₹${bill.dueAmount}`
          )
        );
    }

    // Get admin
    const admin = await Admin.findById(bill.adminId);
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // 1. CREATE DUE REQUEST
    const dueRequest = new DueRequest({
      requestedBy: franchise._id,
      requestedByModel: "Franchise",
      adminId: admin._id,
      franchiseId: franchise._id,
      requestType: "franchise_weekly_bill",
      dueAmount: bill.dueAmount,
      payableAmount: bill.dueAmount,
      status: "pending",
      weekStartDate: bill.weekStartDate,
      weekEndDate: bill.weekEndDate,
      totalGeneratedAmount: bill.totalGeneratedAmount,
      franchiseCommissionAmount: bill.franchiseCommissionAmount,
      adminCommissionAmount: bill.adminCommissionAmount,
      notes: notes || `Manual payment request for bill: ${bill._id}`,
      paymentMethod: paymentMethod,
      paymentPhoto: paymentPhoto,
      approvalLevel: "admin_only",
      approvedByFranchise: false,
      approvedByAdmin: false,
      isAutoGenerated: false, // Manual creation
      weeklyBillId: bill._id, // Link to the bill
    });

    await dueRequest.save();

    // 2. UPDATE BILL STATUS
    bill.dueRequestCreated = true;
    bill.dueRequestCreatedAt = new Date();
    bill.dueRequestId = dueRequest._id;
    bill.status = "pending_payment";

    if (paymentMethod) {
      if (!bill.paymentDetails) bill.paymentDetails = {};
      bill.paymentDetails.paymentMethod = paymentMethod;
    }
    if (paymentPhoto) {
      if (!bill.paymentDetails) bill.paymentDetails = {};
      bill.paymentDetails.paymentPhoto = paymentPhoto;
    }

    await bill.save();

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          dueRequest: {
            id: dueRequest._id,
            billId: bill._id,
            amount: dueRequest.dueAmount,
            status: dueRequest.status,
            createdAt: dueRequest.createdAt,
            paymentMethod: dueRequest.paymentMethod,
          },
          bill: {
            id: bill._id,
            period: `${bill.weekStartDate.toLocaleDateString()} - ${bill.weekEndDate.toLocaleDateString()}`,
            dueAmount: bill.dueAmount,
            status: bill.status,
          },
          franchise: {
            id: franchise._id,
            name: franchise.name,
            dueWallet: franchise.due_wallet,
            newBalanceIfApproved: franchise.due_wallet - bill.dueAmount,
          },
          message:
            "Due request created successfully. Waiting for admin approval.",
        },
        "Due request created from bill successfully"
      )
    );
  } catch (error) {
    console.error("Error creating due request from bill:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create due request"));
  }
});

// ============================================
// GET FRANCHISE BILLING DASHBOARD
// ============================================
export const getFranchiseBillingDashboard = asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;

  try {
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Get recent auto-generated bills
    const recentBills = await WeeklyBill.find({
      franchiseId: franchise._id,
      isAutoGenerated: true,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    // Get due requests
    const dueRequests = await DueRequest.find({
      franchiseId: franchise._id,
      requestType: "franchise_weekly_bill",
    })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: {
            id: franchise._id,
            name: franchise.name,
            dueWallet: franchise.due_wallet,
            accumulatedAdminProfit: franchise.accumulatedAdminProfit,
            nextBillGenerationDate: franchise.nextBillGenerationDate,
          },
          recentBills: recentBills.map((bill) => ({
            id: bill._id,
            period: `${bill.weekStartDate.toLocaleDateString()} - ${bill.weekEndDate.toLocaleDateString()}`,
            amount: bill.dueAmount,
            status: bill.status,
            createdAt: bill.createdAt,
          })),
          dueRequests: dueRequests.map((req) => ({
            id: req._id,
            amount: req.dueAmount,
            status: req.status,
            createdAt: req.createdAt,
          })),
          summary: {
            totalBills: await WeeklyBill.countDocuments({
              franchiseId: franchise._id,
            }),
            pendingBills: await WeeklyBill.countDocuments({
              franchiseId: franchise._id,
              status: "generated",
              dueRequestCreated: false,
            }),
            totalDueAmount: recentBills
              .filter((b) => b.status === "generated" && !b.dueRequestCreated)
              .reduce((sum, b) => sum + b.dueAmount, 0),
          },
        },
        "Franchise billing dashboard fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching franchise dashboard:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch dashboard"));
  }
});

// ============================================
// GET SINGLE DUE REQUEST BY ID
// ============================================
export const getDueRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    if (!isValidObjectId(id)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid due request ID"));
    }

    // First get the due request without weeklyBillId populate
    const dueRequest = await DueRequest.findById(id)
      .populate({
        path: "requestedBy",
        select: "name phone email",
      })
      .populate("adminId", "name email phone")
      .populate("franchiseId", "name email phone")
      .populate("approvedBy", "name email");
    // Remove .populate("weeklyBillId") - since it's not in schema

    if (!dueRequest) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Due request not found"));
    }

    // Format the response
    const formattedDueRequest = {
      _id: dueRequest._id,
      requestedBy: dueRequest.requestedBy,
      requestedByModel: dueRequest.requestedByModel,
      adminId: dueRequest.adminId,
      franchiseId: dueRequest.franchiseId,
      dueAmount: dueRequest.dueAmount,
      payableAmount: dueRequest.payableAmount,
      requestType: dueRequest.requestType,
      status: dueRequest.status,
      weekStartDate: dueRequest.weekStartDate,
      weekEndDate: dueRequest.weekEndDate,
      totalGeneratedAmount: dueRequest.totalGeneratedAmount,
      franchiseCommissionAmount: dueRequest.franchiseCommissionAmount,
      adminCommissionAmount: dueRequest.adminCommissionAmount,
      notes: dueRequest.notes,
      resolvedAt: dueRequest.resolvedAt,
      resolvedBy: dueRequest.resolvedBy,
      paymentMethod: dueRequest.paymentMethod,
      paidAmount: dueRequest.paidAmount,
      paymentDate: dueRequest.paymentDate,
      paymentPhoto: dueRequest.paymentPhoto,
      approvalLevel: dueRequest.approvalLevel,
      approvedByFranchise: dueRequest.approvedByFranchise,
      approvedByAdmin: dueRequest.approvedByAdmin,
      franchiseApprovedAt: dueRequest.franchiseApprovedAt,
      franchiseApprovedBy: dueRequest.franchiseApprovedBy,
      adminApprovedAt: dueRequest.adminApprovedAt,
      approvedBy: dueRequest.approvedBy,
      approvedByModel: dueRequest.approvedByModel,
      // Remove weeklyBillId from here
      createdAt: dueRequest.createdAt,
      updatedAt: dueRequest.updatedAt,
    };

    // Create requester info based on requestedByModel
    let requesterInfo = null;
    if (dueRequest.requestedBy) {
      requesterInfo = {
        id: dueRequest.requestedBy._id,
        name: dueRequest.requestedBy.name || "No Name",
        phone: dueRequest.requestedBy.phone || "No Phone",
        email: dueRequest.requestedBy.email || "No Email",
        type: dueRequest.requestedByModel,
      };
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          dueRequest: formattedDueRequest,
          requester: requesterInfo,
          summary: {
            requestType: dueRequest.requestType,
            status: dueRequest.status,
            amount: dueRequest.dueAmount,
            createdAt: dueRequest.createdAt,
            requesterType: dueRequest.requestedByModel,
          },
        },
        "Due request fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching due request by ID:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch due request"));
  }
});

// ============================================
// GET FRANCHISE DUE REQUEST HISTORY
// ============================================
export const getFranchiseDueRequestHistory = asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;
  const { status, limit = 20, page = 1, startDate, endDate } = req.query;

  try {
    if (!franchiseId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Franchise ID is required"));
    }

    if (!isValidObjectId(franchiseId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid franchise ID format"));
    }

    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Franchise not found"));
    }

    // Build query
    const query = {
      franchiseId: franchise._id,
      requestType: "franchise_weekly_bill",
    };

    // Apply filters
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }

    // Date filters
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get due requests
    const dueRequests = await DueRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("adminId", "name email phone")
      .populate("weeklyBillId")
      .populate({
        path: "requestedBy",
        select: "name phone email",
        model: "Franchise",
      });

    // Get total count
    const total = await DueRequest.countDocuments(query);

    // Calculate totals
    const totals = await DueRequest.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$dueAmount" },
        },
      },
    ]);

    // Format response
    const formattedRequests = dueRequests.map((request) => ({
      id: request._id,
      requestType: request.requestType,
      status: request.status,
      dueAmount: request.dueAmount,
      payableAmount: request.payableAmount,
      createdAt: request.createdAt,
      admin: request.adminId
        ? {
            id: request.adminId._id,
            name: request.adminId.name,
            email: request.adminId.email,
          }
        : null,
      bill: request.weeklyBillId
        ? {
            id: request.weeklyBillId._id,
            weekStartDate: request.weeklyBillId.weekStartDate,
            weekEndDate: request.weeklyBillId.weekEndDate,
          }
        : null,
      paymentInfo: {
        paymentMethod: request.paymentMethod,
        paymentPhoto: request.paymentPhoto,
        paidAmount: request.paidAmount,
        paymentDate: request.paymentDate,
      },
      notes: request.notes,
      approvalInfo: {
        approvedByFranchise: request.approvedByFranchise,
        approvedByAdmin: request.approvedByAdmin,
        franchiseApprovedAt: request.franchiseApprovedAt,
        adminApprovedAt: request.adminApprovedAt,
      },
    }));

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          franchise: {
            id: franchise._id,
            name: franchise.name,
            phone: franchise.phone,
            email: franchise.email,
          },
          dueRequests: formattedRequests,
          summary: {
            totals: totals.reduce((acc, curr) => {
              acc[curr._id] = {
                count: curr.count,
                totalAmount: curr.totalAmount,
              };
              return acc;
            }, {}),
            totalRequests: total,
            totalAmount: totals.reduce(
              (sum, curr) => sum + curr.totalAmount,
              0
            ),
            pendingAmount:
              totals.find((t) => t._id === "pending")?.totalAmount || 0,
            approvedAmount:
              totals.find((t) => t._id === "approved")?.totalAmount || 0,
          },
          pagination: {
            page: parseInt(page),
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
        "Franchise due request history fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching franchise due request history:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch franchise history"));
  }
});

// ============================================
// GET ADMIN AUTO-GENERATED BILLS
// ============================================
export const getAdminAutoGeneratedBills = asyncHandler(async (req, res) => {
  const {
    status,
    franchiseId,
    limit = 50,
    page = 1,
    startDate,
    endDate,
  } = req.query;

  try {
    // Build query
    const query = { isAutoGenerated: true };

    // Apply filters
    if (
      status &&
      ["generated", "pending_payment", "paid", "cancelled"].includes(status)
    ) {
      query.status = status;
    }

    if (franchiseId && isValidObjectId(franchiseId)) {
      query.franchiseId = franchiseId;
    }

    // Date filters
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get weekly bills
    const weeklyBills = await WeeklyBill.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("franchiseId", "name phone email due_wallet")
      .populate("adminId", "name email")
      .populate("dueRequestId");

    // Get total count
    const total = await WeeklyBill.countDocuments(query);

    // Calculate summary stats
    const summaryStats = await WeeklyBill.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$dueAmount" },
          avgAmount: { $avg: "$dueAmount" },
        },
      },
    ]);

    // Calculate overall totals
    const overallTotals = await WeeklyBill.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalAmount: { $sum: "$dueAmount" },
          avgAmount: { $avg: "$dueAmount" },
        },
      },
    ]);

    // Format response
    const formattedBills = weeklyBills.map((bill) => ({
      id: bill._id,
      billNumber: `BILL-${bill._id.toString().slice(-8).toUpperCase()}`,
      period: `${bill.weekStartDate.toLocaleDateString()} - ${bill.weekEndDate.toLocaleDateString()}`,
      weekStartDate: bill.weekStartDate,
      weekEndDate: bill.weekEndDate,
      dueAmount: bill.dueAmount,
      status: bill.status,
      isAutoGenerated: bill.isAutoGenerated,
      dueRequestCreated: bill.dueRequestCreated,
      createdAt: bill.createdAt,
      franchise: bill.franchiseId
        ? {
            id: bill.franchiseId._id,
            name: bill.franchiseId.name,
            phone: bill.franchiseId.phone,
            email: bill.franchiseId.email,
            dueWallet: bill.franchiseId.due_wallet,
          }
        : null,
      admin: bill.adminId
        ? {
            id: bill.adminId._id,
            name: bill.adminId.name,
            email: bill.adminId.email,
          }
        : null,
      dueRequest: bill.dueRequestId
        ? {
            id: bill.dueRequestId._id,
            status: bill.dueRequestId.status,
            createdAt: bill.dueRequestId.createdAt,
          }
        : null,
      paymentDetails: bill.paymentDetails || null,
      notes: bill.notes,
      summary: {
        totalGeneratedAmount: bill.totalGeneratedAmount,
        adminCommissionAmount: bill.adminCommissionAmount,
        franchiseCommissionAmount: bill.franchiseCommissionAmount,
      },
    }));

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          weeklyBills: formattedBills,
          summary: {
            totalBills: total,
            totalAmount: overallTotals[0]?.totalAmount || 0,
            avgAmount: overallTotals[0]?.avgAmount || 0,
            statusBreakdown: summaryStats.reduce((acc, stat) => {
              acc[stat._id] = {
                count: stat.count,
                totalAmount: stat.totalAmount,
                avgAmount: stat.avgAmount,
              };
              return acc;
            }, {}),
            pendingBills: await WeeklyBill.countDocuments({
              ...query,
              status: "generated",
              dueRequestCreated: false,
            }),
            billsWithDueRequest: await WeeklyBill.countDocuments({
              ...query,
              dueRequestCreated: true,
            }),
            paidBills: await WeeklyBill.countDocuments({
              ...query,
              status: "paid",
            }),
          },
          pagination: {
            page: parseInt(page),
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
          filters: {
            status: status || "all",
            franchiseId: franchiseId || "all",
            startDate: startDate || "all",
            endDate: endDate || "all",
          },
        },
        "Admin auto-generated bills fetched successfully"
      )
    );
  } catch (error) {
    console.error("Error fetching admin auto-generated bills:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch admin auto bills"));
  }
});
