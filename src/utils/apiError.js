class ApiError extends Error {
  constructor(
    statusCode = 500,
    message = "Something went wrong",
    errors = [],
    stack = ""
  ) {
    super(message);
    this.name = this.constructor.name; // Set the error name to ApiError
    this.statusCode = statusCode;
    this.data = null;
    this.success = false;
    this.errors = errors;

    // If no stack is provided, use the default stack trace
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
