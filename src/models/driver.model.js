import mongoose, { Schema } from "mongoose";

const driverSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      default: null,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      unique: true,
    },
    login_time: {
      type: String,
      default: "",
    },
    logout_time: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    socketId: {
      type: String, // To store driver's current socketId
      default: null,
    },
    oneSignalPlayerId: {
      type: String,
      default: null,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    due_wallet: {
      type: Number,
      default: 0,
    },
    cash_wallet: {
      type: Number,
      default: 0, // Amount to be paid in cash
    },
    online_wallet: {
      type: Number,
      default: 0, // Amount to be paid online
    },
    total_earning: {
      type: Number,
      default: 0,
      min: [0, "Total earnings cannot be negative"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
    },
    village: {
      type: String,
      required: [true, "Village is required"],
    },
    police_station: {
      type: String,
      required: [true, "Police station is required"],
    },
    landmark: {
      type: String,
      required: [true, "Landmark is required"],
    },
    post_office: {
      type: String,
      required: [true, "Post office is required"],
    },
    district: {
      type: String,
      required: [true, "District is required"],
    },
    pin_code: {
      type: String,
      required: [true, "Pin code is required"],
    },
    // aadhar_number: {
    //   type: String,
    //   required: [true, "Aadhar number is required"],
    // },
    driver_photo: {
      type: String, // URL
    },
    car_photo: {
      type: [String], // Array of URLs
    },
    license_number: {
      type: String,
      required: [true, "License number is required"],
      trim: true,
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
    aadhar_front_photo: {
      type: String, // URL
    },
    aadhar_back_photo: {
      type: String, // URL
    },
    current_location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    total_complete_rides: {
      type: Number,
      default: 0,
    },
    is_on_ride: {
      type: Boolean,
      default: false,
    },
    current_ride_id: {
      type: Schema.Types.ObjectId, // Assuming it's an ObjectId
      ref: "RideDetails",
    },
    total_completed_km: {
      type: Number,
      default: 0,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    hasDueRequest: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

// Create a 2dsphere index on the current_location field for geospatial queries
driverSchema.index({ current_location: "2dsphere" });

export const Driver = mongoose.model("Driver", driverSchema);
