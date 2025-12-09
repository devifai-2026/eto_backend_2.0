import { ApiError } from "../utils/apiError.js";

const errorHandler = (err, req, res, next) => {
  // Log the error once if not logged already
  if (!err.logged) {
    console.error(err);
    err.logged = true; // Mark error as logged
  }

  // Handle ApiError instances
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: err.success,
      message: err.message,
      statusCode: err.statusCode,
      data: err.data || null, // Include any additional data
      errors: err.errors.length ? err.errors : undefined,
    });
  }

  // Default error response for non-ApiError instances
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    statusCode: 500,
    data: null,
    errors: [],
  });
};

export default errorHandler;
