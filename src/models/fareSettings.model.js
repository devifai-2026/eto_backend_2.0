import mongoose, { Schema } from "mongoose";

const fareSettingsSchema = new Schema(
  {
    // Base Fare Settings
    base_fare: {
      type: Number,
      default: 20, // Default ₹20 base fare for entire system
      required: true,
    },

    // Distance-based charges
    per_km_charge: {
      type: Number,
      default: 8, // Default ₹8 per km for entire system
      required: true,
    },

    // Night time surcharge
    night_surcharge_percentage: {
      type: Number,
      default: 20, // 20% extra at night (10 PM to 6 AM)
      max: 100,
    },

    // Night time hours (in 24-hour format)
    night_start_hour: {
      type: Number,
      default: 22, // 10 PM
      max: 23,
    },

    night_end_hour: {
      type: Number,
      default: 6, // 6 AM
      max: 23,
    },

    // Last changed by
    last_changed_by: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Fare settings change history
    fare_history: [
      {
        field_name: {
          type: String,
          enum: [
            "base_fare",
            "per_km_charge",
            "night_surcharge_percentage",
            "night_start_hour",
            "night_end_hour",
          ],
          required: true,
        },
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
  },
  {
    timestamps: true,
  }
);

// Ensure only one document exists
fareSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this();
    await settings.save();
  }
  return settings;
};

// Indexes
fareSettingsSchema.index({ createdAt: -1 });

export const FareSettings = mongoose.model("FareSettings", fareSettingsSchema);
