import mongoose, { Schema } from "mongoose";
import { Admin } from "./admin.model.js";
import { FranchiseCommissionSettings } from "./commissionSettings.model.js";

const franchiseSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Franchise name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[0-9]{10}$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid 10-digit phone number!`,
      },
    },

    // Address Information
    address: {
      street_address: {
        type: String,
        required: [true, "Street address is required"],
        trim: true,
      },
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },
      state: {
        type: String,
        required: [true, "State is required"],
        trim: true,
      },
      country: {
        type: String,
        required: [true, "Country is required"],
        default: "India",
        trim: true,
      },
      district: {
        type: String,
        required: [true, "District is required"],
        trim: true,
      },
      pincode: {
        type: String,
        required: [true, "Pincode is required"],
        trim: true,
        validate: {
          validator: function (v) {
            return /^[0-9]{6}$/.test(v);
          },
          message: (props) => `${props.value} is not a valid 6-digit pincode!`,
        },
      },
    },

    // Pincode Access Management
    accessible_pincodes: [
      {
        pincode: {
          type: String,
          required: true,
          trim: true,
          validate: {
            validator: function (v) {
              return /^[0-9]{6}$/.test(v);
            },
            message: (props) =>
              `${props.value} is not a valid 6-digit pincode!`,
          },
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        addedBy: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // Bank Information
    bank_details: {
      account_holder_name: {
        type: String,
        required: [true, "Account holder name is required"],
        trim: true,
      },
      account_number: {
        type: String,
        required: [true, "Account number is required"],
        trim: true,
        validate: {
          validator: function (v) {
            return /^[0-9]{9,18}$/.test(v);
          },
          message: (props) => `${props.value} is not a valid account number!`,
        },
      },
      ifsc_code: {
        type: String,
        required: [true, "IFSC code is required"],
        trim: true,
        uppercase: true,
        validate: {
          validator: function (v) {
            return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
          },
          message: (props) => `${props.value} is not a valid IFSC code!`,
        },
      },
      branch_name: {
        type: String,
        required: [true, "Branch name is required"],
        trim: true,
      },
    },

    // Document Information
    documents: {
      identity_documents: [
        {
          type: String, // Array of URLs for identity documents
          required: [true, "At least one identity document is required"],
        },
      ],
      trade_license: {
        type: String, // URL for trade license image
        required: [true, "Trade license image is required"],
      },
    },

    // Status and References
    isActive: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Admin ID is required"],
    },

    // Statistics and Tracking
    total_drivers: {
      type: Number,
      default: 0,
      min: 0,
    },
    due_wallet: {
      type: Number,
      default: 0,
      min: [0, "Due wallet cannot be negative"],
    },
    total_earnings: {
      type: Number,
      default: 0,
      min: [0, "Total earnings cannot be negative"],
    },
    accumulatedAdminProfit: {
      type: Number,
      default: 0,
    },
    weeklyAccumulations: {
      type: Map,
      of: {
        adminProfit: Number,
        franchiseProfit: Number,
        totalRides: Number,
      },
      default: {},
    },
     lastWeeklyBillGeneratedAt: {
      type: Date,
      default: null,
    },

    nextBillGenerationDate: {
      type: Date,
      default: function() {
        // 1 week from creation date
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return date;
      },
    },

    autoBillGenerationEnabled: {
      type: Boolean,
      default: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    socketId: {
      type: String,
      default: null,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },

    // Additional Information
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
franchiseSchema.index({ email: 1 }, { unique: true });
franchiseSchema.index({ phone: 1 }, { unique: true });
franchiseSchema.index({ "address.city": 1 });
franchiseSchema.index({ "address.district": 1 });
franchiseSchema.index({ isActive: 1, isApproved: 1 });
franchiseSchema.index({ createdBy: 1 });
franchiseSchema.index({ "accessible_pincodes.pincode": 1 });

// Auto-create commission settings when a new franchise is created
franchiseSchema.post("save", async function (doc, next) {
  try {
    const admin = await Admin.findOne();

    if (!admin) {
      console.warn("Admin not found. Skipping commission settings creation.");
      return next();
    }

    // Check if commission settings already exist
    const existingSettings = await FranchiseCommissionSettings.findOne({
      franchiseId: doc._id,
    });

    if (!existingSettings) {
      const commissionSettings = new FranchiseCommissionSettings({
        franchiseId: doc._id,
        admin_commission_rate: 18,
        franchise_commission_rate: 10,
        last_changed_by: admin._id,
      });

      // Add initial history entries
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

      console.log(`Commission settings created for franchise: ${doc.name}`);
    }

    next();
  } catch (error) {
    console.error("Error creating franchise commission settings:", error);
    next(error);
  }
});

export const Franchise = mongoose.model("Franchise", franchiseSchema);
