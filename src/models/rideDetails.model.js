import mongoose, { Schema } from "mongoose";

// Define the schema for RideDetails
const rideDetailsSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true, // Now required without a default
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    riderId: {
      type: Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    driverNumber: {
      type: Number,
    },
    riderNumber: {
      type: Number,
    },
    // Define pickup_location as a GeoJSON Point
    pickup_location: {
      type: {
        type: String, // Type of GeoJSON object
        enum: ["Point"], // Must be 'Point'
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: [
          arrayOfNumbers,
          "Coordinates must be an array of two numbers (Longitude and Latitude)",
        ],
      },
    },
    // Define drop_location as a GeoJSON Point
    drop_location: {
      type: {
        type: String, // Type of GeoJSON object
        enum: ["Point"], // Must be 'Point'
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: [
          arrayOfNumbers,
          "Coordinates must be an array of two numbers (Longitude and Latitude)",
        ],
      },
    },
    total_km: {
      type: Number,
      required: true,
    },
    pickup_otp: {
      type: Number,
      required: true,
    },
    drop_otp: {
      type: Number,
      required: true,
    },
    total_amount: {
      type: Number,
      default: 0,
    },
    admin_percentage: {
      type: Number,
      default: 0,
    },
    admin_profit: {
      type: Number,
      default: 0,
    },
    driver_profit: {
      type: Number,
      default: 0,
    },
    payment_mode: {
      type: String,
      enum: ["cash", "online"],
    },
    isPayment_done: {
      type: Boolean,
      default: false,
    },
    isRide_accept: {
      type: Boolean,
      default: false,
    },
    isRide_started: {
      type: Boolean,
      default: false,
    },
    isRide_ended: {
      type: Boolean,
      default: false,
    },
    started_time: {
      type: Date,
    },
    drop_time: {
      type: Date,
    },
    ride_end_time: {
      type: Date,
    },
    total_duration: {
      type: String,
    },
    isOn: {
      type: Boolean,
      default: false, // Indicates if the ride is currently active
    },
    isPickUp_verify: {
      type: Boolean,
      default: false, // Indicates if pickup OTP is verified
    },
    isDrop_verify: {
      type: Boolean,
      default: false, // Indicates if drop OTP is verified
    },
    isCancel_time: {
      type: Boolean,
      default: false, // Indicates if drop OTP is verified
    },
  },
  { timestamps: true }
);

// Validator function to check that array contains exactly two numbers
function arrayOfNumbers(val) {
  return (
    Array.isArray(val) &&
    val.length === 2 &&
    val.every((num) => typeof num === "number")
  );
}

// Add GeoJSON index for pickup_location and drop_location
rideDetailsSchema.index({ pickup_location: "2dsphere" });
rideDetailsSchema.index({ drop_location: "2dsphere" });

// Create and export the model
export const RideDetails = mongoose.model("RideDetails", rideDetailsSchema);
