import mongoose from "mongoose";
import { Admin } from "../models/admin.model.js";
import { Driver } from "../models/driver.model.js";
import { DueRequest } from "../models/dueRequest.model.js";
import { Khata } from "../models/khata.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";

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
  const { dueRequestId } = req.params; // Assuming the due request ID is passed as a parameter

  try {
    // Find the due request and populate driver details
    const dueRequest = await DueRequest.findById(dueRequestId)
      .populate("requestedBy", "driver_photo phone name") // Populate specific fields from the Driver model
      .exec();

    if (!dueRequest) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Due request not found"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { dueRequest },
          "Due request fetched successfully."
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch due request"));
  }
});

// Update Due Request Status and Update Driver/Admin Wallets & Earnings
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

    // Update the due wallet of the driver and admin
    const driver = await Driver.findOne({ userId: dueRequest.requestedBy });
    const admin = await Admin.findById(dueRequest.adminId);

    // console.log("Driver", driver);

    if (!driver || !admin) {
      return res.status(404).json({
        message: "Driver or Admin not found.",
      });
    }

    // Add payment details to Khata (this will be removed after approval)
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

      // Update driver and admin wallets
      driver.total_earning += khata.driverdue; // Correctly increment total earnings
      driver.due_wallet -= dueRequest.dueAmount;

      admin.due_wallet -= dueRequest.dueAmount;
      admin.total_earning += dueRequest.dueAmount;

      khata.driverdue -= khata.driverdue;
      khata.admindue -= khata.admindue;

      // Remove the payment details from Khata's due_payment_details after approval
      khata.due_payment_details = khata.due_payment_details.filter(
        (payment) => !payment.driverId.equals(driver._id)
      );

      console.log(
        "Khata Details Before Update:",
        JSON.stringify(khata.due_payment_details, null, 2)
      );
      console.log("Driver ID:", driver._id.toString());
      console.log("Due Amount:", dueRequest.dueAmount);

      await khata
        .save()
        .then(() => {
          console.log("Khata updated successfully");
        })
        .catch((err) => {
          console.error("Error saving Khata:", err);
        });

      // Update the due request with status, resolved time, and payment details
      dueRequest.status = "approved";
      dueRequest.resolvedAt = new Date();
      dueRequest.paidAmount = dueRequest.dueAmount;
      dueRequest.paymentDate = new Date();
      dueRequest.paymentMethod = paymentMethod || "cash"; // Default to "cash" if not provided
      dueRequest.paymentPhoto = paymentPhoto;
    } else if (status === "rejected") {
      // Handle rejection status and add the rejection reason in the notes
      dueRequest.status = "rejected";
      dueRequest.notes = note || "No rejection reason provided"; // Default note if none is provided
    }

    // Save the updated due request
    await dueRequest.save();

    // Save the updated driver and admin details
    await driver.save();
    await admin.save();

    return res.status(200).json({
      message: "Due request status updated successfully.",
    });
  } catch (error) {
    console.error("Error updating due request status:", error.message);
    return res.status(500).json({
      message: "Failed to update due request status.",
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
