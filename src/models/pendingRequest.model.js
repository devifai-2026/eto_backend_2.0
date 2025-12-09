import mongoose from "mongoose";
const pendingRideRequestSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    required: true,
  },
  riderSocketId: { type: String, required: true },
  data: { type: Object, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
export const PendingRideRequest = mongoose.model(
  "PendingRideRequest",
  pendingRideRequestSchema
);
