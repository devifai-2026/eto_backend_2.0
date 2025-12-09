import mongoose, { Schema } from "mongoose";

const riderSchema = new Schema(
  {
    name: {
      type: String,
      // required: [true, "Name is required"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    is_on_ride: {
      type: Boolean,
      default: false,
    },
    photo: {
      type: String,
      default: "",
    },
    total_numbers_of_rides: {
      type: Number,
      default: 0,
    },
    ride_details: [
      {
        rideDetailsId: {
          type: Schema.Types.ObjectId,
          ref: "RideDetails",
          required: true,
        },
        paymentMode: {
          type: String,
          enum: ["cash", "online"],
          required: true,
        },
      },
    ],
    current_location: {
      type: {
        type: String,
        enum: ["Point"],
        // required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        // required: true,
      },
    },
    current_ride_id: {
      type: Schema.Types.ObjectId,
      ref: "RideDetails",
    },
    socketId: {
      type: String, // To store driver's current socketId
      default: null,
    },
  },
  { timestamps: true }
);

// Create a 2dsphere index on the current_location field for geospatial queries
riderSchema.index({ current_location: "2dsphere" });

export const Rider = mongoose.model("Rider", riderSchema);
