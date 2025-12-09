import mongoose, { Schema } from "mongoose";

// Define the DueRequest schema
const dueRequestSchema = new Schema(
  {
    requestedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "Driver", // Refers to the "Driver" model or another model depending on the context
    },
    adminId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "Driver", // Refers to the "Driver" model or another model depending on the context
    },
    dueAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin", // Refers to the "Admin" model
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
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create and export the model
export const DueRequest = mongoose.model("DueRequest", dueRequestSchema);
