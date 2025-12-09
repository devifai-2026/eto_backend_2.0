import mongoose, { Schema } from "mongoose";

const ratingSchema = new Schema(
  {
    
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: [true, "riderId ID is required"],
    },
    driverUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "driverId ID is required"],
    },
    message: {
      type: String,
      default : null
    },
    rating:{
      type: Number ,
      required: [true, "rating  is required"],
    }
 
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);

export const Rating = mongoose.model("Rating", ratingSchema);
