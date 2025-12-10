import mongoose, { Schema } from "mongoose";

const franchiseCommissionSettingsSchema = new Schema(
  {
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      required: true,
      unique: true,
    },

    // Commission Settings for this specific franchise
    admin_commission_rate: {
      type: Number,
      default: 18, // Default 18% admin commission for this franchise
    },

    franchise_commission_rate: {
      type: Number,
      default: 10, // Default 10% franchise commission for this franchise
    },

    // Settings change history for this franchise
    settings_history: [
      {
        setting_type: {
          type: String,
          enum: [
            "admin_commission",
            "franchise_commission",
          ],
          required: true,
        },
        field_name: String,
        old_value: Number,
        new_value: Number,
        changed_by: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
        },
        changed_at: {
          type: Date,
          default: Date.now,
        },
        reason: String,
      },
    ],

    // Last changed by
    last_changed_by: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
franchiseCommissionSettingsSchema.index({ franchiseId: 1 }, { unique: true });
franchiseCommissionSettingsSchema.index({ isActive: 1 });

export const FranchiseCommissionSettings = mongoose.model(
  "FranchiseCommissionSettings",
  franchiseCommissionSettingsSchema
);
