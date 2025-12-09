import { asyncHandler } from "../utils/asyncHandler.js";
import { ETOCard } from "../models/eto.model.js";
import ApiResponse from "../utils/ApiResponse.js";

export const getETOCardById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const etoCard = await ETOCard.findOne({ userId: id });

    if (!etoCard) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "ETOCard not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, etoCard, "ETOCard retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving ETOCard:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to retrieve ETOCard"));
  }
});


export const updateManyETOCards = asyncHandler(async (req, res) => {
  const updateData = req.body;

  if (!updateData || Object.keys(updateData).length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No update data provided"));
  }

  try {
    const result = await ETOCard.updateMany({}, { $set: updateData });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Fields updated for all ETOCards successfully"
        )
      );
  } catch (error) {
    console.error("Error updating ETOCards:", error.message);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update ETOCards"));
  }
});
