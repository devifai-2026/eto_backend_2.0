import dotenv from "dotenv";
import { ApiError } from "./apiError.js";
import request from "request";

dotenv.config();

const authToken = process.env.MESSAGE_CENTRAL_AUTH_TOKEN; // Ensure this is stored in your .env file
const customerId = process.env.MESSAGE_CENTRAL_CUSTOMER_ID; // Store this in .env as well

// Function to Send OTP via Message Central
export const sendOtpViaMessageCentral = async (phone) => {
  const options = {
    method: "POST",
    url: `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${phone}`,
    headers: {
      authToken: authToken,
    },
  };

  return new Promise((resolve, reject) => {
    request(options, function (error, response) {
      if (error) {
        console.error("Error sending OTP via Message Central:", error.message);
        reject(new ApiError(500, "Failed to send OTP"));
      } else {
        try {
          const responseBody = JSON.parse(response.body);
          // Check for specific errors from Message Central API
          if (responseBody.error) {
            console.error("Message Central Error:", responseBody.error);
            reject(
              new ApiError(500, `OTP service error: ${responseBody.error}`)
            );
          } else {
            resolve(responseBody); // Return the parsed response
          }
        } catch (parseError) {
          console.error("Error parsing OTP response:", parseError.message);
          reject(new ApiError(500, "Failed to parse OTP response"));
        }
      }
    });
  });
};

// Function to Validate OTP via Message Central
export const validateOtpViaMessageCentral = async (
  phone,
  verificationId,
  code
) => {
  const options = {
    method: "GET",
    url: `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${verificationId}&customerId=${customerId}&code=${code}`,
    headers: {
      authToken: authToken,
    },
  };

  return new Promise((resolve, reject) => {
    request(options, function (error, response) {
      if (error) {
        console.error(
          "Error validating OTP via Message Central:",
          error.message
        );
        reject(new ApiError(500, "Failed to validate OTP"));
      } else {
        // console.log("Response Status Code:", response.statusCode); // Log the status code
        // console.log("Response Body:", response.body); // Log the response body for debugging

        try {
          const responseBody = JSON.parse(response.body);
          // Check if validation failed
          if (responseBody.error) {
            console.error(
              "Message Central OTP validation error:",
              responseBody.error
            );
            reject(
              new ApiError(400, `OTP validation failed: ${responseBody.error}`)
            );
          } else {
            console.log(responseBody);
            resolve(responseBody); // Return the parsed response
          }
        } catch (parseError) {
          console.error(
            "Error parsing OTP validation response:",
            parseError.message
          );
          reject(new ApiError(500, "Failed to parse OTP validation response"));
        }
      }
    });
  });
};

