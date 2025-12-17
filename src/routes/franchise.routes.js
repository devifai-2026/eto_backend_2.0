import express from "express";
import {
  createFranchise,
  getAllFranchises,
  getFranchiseById,
  updateFranchise,
  deleteFranchise,
  getFranchiseDrivers,
  addPincodeAccess,
  removePincodeAccess,
  getFranchisePincodes,
  updateFranchiseStatus,
  getAllDriversWithoutFranchise,
  assignDriversToFranchise,
  uploadFranchiseDocuments,
} from "../controllers/franchise.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  adminOnly,
  franchiseOnly,
  adminOrFranchise,
} from "../middlewares/role.middleware.js";
import { uploadFranchiseDocuments as uploadMiddleware } from "../middlewares/multer.middleware.js";
import multer from "multer";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyJWT);

// 1. Create Franchise (Admin Only)
router.route("/").post(adminOnly, createFranchise);

// 2. Get All Franchises (Admin Only)
router.route("/").get(adminOnly, getAllFranchises);

// 3. Get Franchise by ID (Admin or Franchise for their own)
router.route("/:id").get(adminOrFranchise, getFranchiseById);

// 4. Update Franchise (Admin Only)
router.route("/:id").put(adminOnly, updateFranchise);

// 5. Delete Franchise (Admin Only)
router.route("/:id").delete(adminOnly, deleteFranchise);

// 6. Get Drivers under Franchise (Admin or Franchise for their own)
router.route("/:id/drivers").get(adminOrFranchise, getFranchiseDrivers);

// 7. Add Pincode Access to Franchise (Admin Only)
router.route("/:id/pincodes").post(adminOnly, addPincodeAccess);

// 8. Remove Pincode Access from Franchise (Admin Only)
router.route("/:id/pincodes/:pincodeId").delete(adminOnly, removePincodeAccess);

// 9. Get Franchise's Accessible Pincodes (Admin or Franchise for their own)
router.route("/:id/pincodes").get(adminOrFranchise, getFranchisePincodes);

// 10. Update Franchise Status (Admin Only)
router.route("/:id/status").patch(adminOnly, updateFranchiseStatus);

// 11. Get all drivers without franchise (Admin Only)
router
  .route("/drivers/without-franchise")
  .get(adminOnly, getAllDriversWithoutFranchise);

// 12. Assign drivers to franchise (Admin Only)
router.route("/:id/assign-drivers").post(adminOnly, assignDriversToFranchise);

// 13. Get franchise profile for current franchise user
router.route("/profile/me").get(
  franchiseOnly,
  async (req, res, next) => {
    // Pass "me" as ID to getFranchiseById controller
    req.params.id = "me";
    next();
  },
  getFranchiseById
);

// 14. Upload Franchise Documents (Admin Only)
router.route("/:id/documents").post(
  adminOnly,
  uploadMiddleware.fields([
    { name: "identity_documents", maxCount: 5 },
    { name: "trade_license", maxCount: 1 },
  ]),
  uploadFranchiseDocuments
);

// 15. Error handling middleware for multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    // Multer-specific errors
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum size is 5MB.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files uploaded.",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected field name in file upload.",
      });
    }
  } else if (error) {
    // Other errors
    return res.status(400).json({
      success: false,
      message: error.message || "File upload failed.",
    });
  }
  next();
});

export default router;
