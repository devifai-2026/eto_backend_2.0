import mongoose, { Schema } from "mongoose";

const dueRequestSchema = new Schema(
  {
    requestedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "requestedByModel",
    },

    requestedByModel: {
      type: String,
      required: true,
      enum: ["Driver", "Franchise"],
    },

    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      default: null,
    },

    dueAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    payableAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    requestType: {
      type: String,
      required: true,
      enum: ["driver_due", "franchise_weekly_bill"],
      default: "driver_due",
    },

    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Weekly Bill Specific Fields
    weekStartDate: {
      type: Date,
      default: null,
    },

    weekEndDate: {
      type: Date,
      default: null,
    },

    totalGeneratedAmount: {
      type: Number,
      default: 0,
    },

    franchiseCommissionAmount: {
      type: Number,
      default: 0,
    },

    adminCommissionAmount: {
      type: Number,
      default: 0,
    },

    notes: {
      type: String,
    },

    resolvedAt: {
      type: Date,
    },

    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "online"],
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentDate: {
      type: Date,
    },

    paymentPhoto: {
      type: String,
    },
    approvalLevel: {
      type: String,
      enum: ["franchise_first", "admin_only"],
      default: "admin_only",
    },
    approvedByFranchise: {
      type: Boolean,
      default: false,
    },
    approvedByAdmin: {
      type: Boolean,
      default: false,
    },
    franchiseApprovedAt: {
      type: Date,
    },
    franchiseApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
    },
    adminApprovedAt: {
      type: Date,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      refPath: "approvedByModel",
    },
    approvedByModel: {
      type: String,
      enum: ["Admin", "Franchise"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
dueRequestSchema.index({ status: 1 });
dueRequestSchema.index({ requestedBy: 1, requestedByModel: 1 });
dueRequestSchema.index({ franchiseId: 1, status: 1 });
dueRequestSchema.index({ requestType: 1 });
dueRequestSchema.index({ createdAt: -1 });
dueRequestSchema.index({
  franchiseId: 1,
  requestType: 1,
  weekStartDate: 1,
  weekEndDate: 1,
});

export const DueRequest = mongoose.model("DueRequest", dueRequestSchema);
