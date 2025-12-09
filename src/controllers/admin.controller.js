import { Admin } from "../models/admin.model.js";
import { User } from "../models/user.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Admin
export const createAdmin = asyncHandler(async (req, res) => {
  const { phone, email } = req.body;

  if (!phone || !email) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number and email are required"));
  }

  try {
    // Check if the user exists
    const existsUser = await User.findOne({ phone });
    if (!existsUser) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "User does not exist"));
    }

    // Check if the user is marked as a driver
    if (existsUser.isDriver) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "User already has a driver account"));
    }

    // Check if the user is marked as a rider but not an admin
    if (!existsUser.isAdmin && existsUser.isDriver === false) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "User already has a rider account"));
    }

    // Check if an admin already exists with the given phone number or email
    const existsAdmin = await Admin.findOne({ $or: [{ phone }, { email }] });
    if (existsAdmin) {
      return res
        .status(200)
        .json(new ApiResponse(200, null, "Admin already exists"));
    }

    // Create a new Admin instance
    const adminData = {
      ...req.body,
      userId: existsUser._id, // Link the admin to the existing user
    };

    const newAdmin = new Admin(adminData);

    // Validate and save the admin document
    const savedAdmin = await newAdmin.save();

    return res
      .status(201)
      .json(new ApiResponse(201, savedAdmin, "Admin created successfully"));
  } catch (error) {
    console.error("Error creating admin:", error.message);

    // If the error is a validation error (Mongoose validation error)
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Validation failed: ${errorMessages.join(", ")}`
          )
        );
    }

    // Generic error response for other types of errors
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create admin"));
  }
});

// Get Admin by ID
export const getAdminById = asyncHandler(async (req, res) => {
  const { adminId } = req.params; // Admin ID passed in the URL

  try {
    // Find the admin by ID
    const admin = await Admin.findById(adminId).populate(
      "userId",
      "name email phone"
    ); // Populate user details if needed

    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Return the admin details
    return res
      .status(200)
      .json(new ApiResponse(200, admin, "Admin details fetched successfully"));
  } catch (error) {
    console.error("Error fetching admin by ID:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch admin by ID"));
  }
});

// Get Admin Total Earnings by ID
export const getAdminTotalEarnings = asyncHandler(async (req, res) => {
  const { adminId } = req.params; // Admin ID passed in the URL

  try {
    // Find the admin by ID
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Return the total earnings of the admin
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { totalEarnings: admin.total_earning },
          "Admin total earnings fetched successfully"
        )
      );
  } catch (error) {
    console.error("Error fetching admin total earnings:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch admin total earnings"));
  }
});

// Update Admin Profile
export const updateAdminProfile = asyncHandler(async (req, res) => {
  const { adminId } = req.params; // Admin ID passed in the URL
  const { name, email, phone, photo } = req.body;

  // Validate that at least one field is being provided for the update
  if (!name && !email && !phone && !photo) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "At least one field is required to update")
      );
  }

  try {
    // Find the admin by ID
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Admin not found"));
    }

    // Check if the email or phone number is already taken by another admin
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { phone }],
      _id: { $ne: adminId }, // Exclude the current admin from the check
    });
    if (existingAdmin) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Email or phone number is already taken")
        );
    }

    // Update the admin fields
    if (name) admin.name = name;
    if (email) admin.email = email;
    if (phone) admin.phone = phone;
    if (photo) admin.photo = photo; // Assuming `photo` is the URL to the profile photo

    // Save the updated admin document
    const updatedAdmin = await admin.save();

    // Also update the corresponding user document
    const user = await User.findById(admin.userId);
    if (user) {
      // Update the User model with the new email and phone (if provided)
      if (email) user.email = email;
      if (phone) user.phone = phone;

      // Save the updated user document
      await user.save();
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedAdmin, "Admin profile updated successfully")
      );
  } catch (error) {
    console.error("Error updating admin profile:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update admin profile"));
  }
});
