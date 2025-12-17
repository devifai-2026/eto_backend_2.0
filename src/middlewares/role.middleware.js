import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Admin only middleware
export const adminOnly = asyncHandler(async (req, res, next) => {
  try {
    // Check if user exists and is admin
    if (!req.user) {
      throw new ApiError(401, "User not authenticated");
    }

    if (!req.user.isAdmin) {
      throw new ApiError(403, "Access denied. Admin privileges required.");
    }

    next();
  } catch (error) {
    throw new ApiError(
      error.statusCode || 403,
      error.message || "Access denied"
    );
  }
});

// Franchise only middleware
export const franchiseOnly = asyncHandler(async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "User not authenticated");
    }

    if (!req.user.isFranchise) {
      throw new ApiError(403, "Access denied. Franchise privileges required.");
    }

    next();
  } catch (error) {
    throw new ApiError(
      error.statusCode || 403,
      error.message || "Access denied"
    );
  }
});

// Admin or Franchise middleware
export const adminOrFranchise = asyncHandler(async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "User not authenticated");
    }

    if (!req.user.isAdmin && !req.user.isFranchise) {
      throw new ApiError(
        403,
        "Access denied. Admin or Franchise privileges required."
      );
    }

    next();
  } catch (error) {
    throw new ApiError(
      error.statusCode || 403,
      error.message || "Access denied"
    );
  }
});
