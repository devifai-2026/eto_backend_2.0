import mongoose, { Schema } from "mongoose";

const adminSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    socketId: {
      type: String,
      default: null,
    },
    total_earning: {
      type: Number,
      default: 0,
      min: [0, "Total earnings cannot be negative"],
    },
    due_wallet: {
      type: Number,
      default: 0, // Default value for the due_wallet
      min: [0, "Due wallet cannot be negative"], // Ensure the due_wallet can't go negative
    },
    photo: {
      type: String,
      required: [true, "Photo is required"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      validate: {
        validator: function (v) {
          return /^[0-9]{10}$/.test(v); // Validates a 10-digit phone number
        },
        message: (props) => `${props.value} is not a valid phone number!`,
      },
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);

export const Admin = mongoose.model("Admin", adminSchema);
