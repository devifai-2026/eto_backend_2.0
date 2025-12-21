import mongoose, { Schema } from "mongoose";

const khataSchema = new Schema(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      default: null, // Will be null for non-franchise drivers
    },
    driverdue: {
      type: Number,
      default: 0,
    },
    admindue: {
      type: Number,
      default: 0,
    },
    franchisedue: {
      type: Number,
      default: 0, // Money owed to franchise
    },
    due_payment_details: [
      {
        driverId: {
          type: Schema.Types.ObjectId,
          ref: "Driver",
          required: [true, "Driver ID is required"],
        },
        rideId: {
          type: Schema.Types.ObjectId,
          ref: "Ride",
          default: null,
          // required: [true, "Ride ID is required"],
        },
        total_price: {
          type: Number,
          default: 0,
          required: [true, "Driver due payment amount is required"],
        },
        admin_profit: {
          type: Number,
          default: 0,
        },
        franchise_profit: {
          type: Number,
          default: 0, // Will be 0 for non-franchise drivers
        },
        driver_profit: {
          type: Number,
          default: 0,
        },
        payment_mode: {
          type: String,
          enum: ["cash", "online"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Create the Khata model
export const Khata = mongoose.model("Khata", khataSchema);
