import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;
import { getCurrentLocalDate } from "../utils/getCurrentLocalDate.js";

const WithdrawalLogsSchema = new Schema(
  {
    driverId: {
      type: Types.ObjectId,
      ref: "Driver", // Reference to the Driver model
      required: true,
    },
    withdrawalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    withdrawalDate: {
      type: Date,
      required: true,
    },
    withdrawalTime: {
      type: String, // e.g., "14:30"
      required: true,
    },
    withdrawalMode: {
      type: String,
      enum: ["cash", "upi", "bank transfer"],
      required: true,
    },
    upiDetails: {
      upiId: {
        type: String,
        required: function () {
          return this.withdrawalMode === "upi";
        },
      },
    },
    bankDetails: {
      accountNumber: {
        type: String,
        required: function () {
          return this.withdrawalMode === "bank transfer";
        },
      },
      bankName: {
        type: String,
        required: function () {
          return this.withdrawalMode === "bank transfer";
        },
      },
      ifscCode: {
        type: String,
        required: function () {
          return this.withdrawalMode === "bank transfer";
        },
      },
    },
  },
  { timestamps: true }
);

WithdrawalLogsSchema.pre("save", function (next) {
  const localDate = getCurrentLocalDate(); // Adjust to local timezone
  this.createdAt = localDate;
  this.updatedAt = localDate;
  next();
});
// Pre-save hook to remove irrelevant fields based on withdrawalMode
WithdrawalLogsSchema.pre("save", function (next) {
  if (this.withdrawalMode === "cash") {
    delete this.upiDetails;
    delete this.bankDetails;
  } else if (this.withdrawalMode === "upi") {
    delete this.bankDetails;
  } else if (this.withdrawalMode === "bank transfer") {
    delete this.upiDetails;
  }
  next();
});

export const WithdrawalLogs = model("WithdrawalLogs", WithdrawalLogsSchema);
