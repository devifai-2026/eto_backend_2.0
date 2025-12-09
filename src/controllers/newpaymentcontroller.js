// importing modules
import axios from "axios";
import sha256 from "sha256";

// UAT environment
const MERCHANT_ID = "PGTESTPAYUAT86";
const PHONE_PE_HOST_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const SALT_INDEX = 1;
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";
// const APP_BE_URL = "http://localhost:8000";

// Function to generate a unique transaction ID
function generatedTranscId() {
  return "T" + Date.now();
}

// endpoint to initiate a payment
export const createPayment = async function (req, res, next) {

  // const { useId, amount, mobileNumber } = req.body;

  try {
    const payEndPoint = "/pg/v1/pay";
    const merchantUserId = generatedTranscId();
    const useId = "user123";
    const normalPayLoad = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: merchantUserId, // need
      merchantUserId: useId, //need
      amount: 1000, // need
      redirectUrl: `http://localhost:8000/redirect-url/${merchantUserId}`,
      redirectMode: "REDIRECT",
      mobileNumber: "9755225577", //need
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };
    // console.log({ normalPayLoad });

    let bufferObj = Buffer.from(JSON.stringify(normalPayLoad), "utf8");
    let base64EncodedPayload = bufferObj.toString("base64"); // need

    // X-VERIFY => SHA256(base64EncodedPayload + "/pg/v1/pay" + SALT_KEY) + ### + SALT_INDEX
    let string = `${base64EncodedPayload}/pg/v1/pay${SALT_KEY}`;
    let sha256_val = sha256(string);
    let xVerifyChecksum = sha256_val + "###" + SALT_INDEX; // need

    const options = {
      method: "post",
      url: `${PHONE_PE_HOST_URL}${payEndPoint}`,
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-VERIFY": xVerifyChecksum,
      },
      data: { request: base64EncodedPayload },
    };

    axios
      .request(options)
      .then(function (resp) {
        console.log(resp.data.data.instrumentResponse.redirectInfo.url);
        res.redirect(resp.data.data.instrumentResponse.redirectInfo.url);
      })
      .catch(function (err) {
        console.log(err);
      });
  } catch (error) {}
};

// endpoint to check the status of payment
export const checkStatus = async function (req, res) {
  const { merchantTransactionId } = req.params;
  // check the status of the payment using merchantTransactionId
  if (merchantTransactionId) {
    let statusUrl =
      `${PHONE_PE_HOST_URL}/pg/v1/status/${MERCHANT_ID}/` +
      merchantTransactionId;

    // generate X-VERIFY
    let string =
      `/pg/v1/status/${MERCHANT_ID}/` + merchantTransactionId + SALT_KEY;
    let sha256_val = sha256(string);
    let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;

    axios
      .get(statusUrl, {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerifyChecksum,
          "X-MERCHANT-ID": merchantTransactionId,
          accept: "application/json",
        },
      })
      .then(function (response) {
        console.log("response->", response.data);
        if (response.data && response.data.code === "PAYMENT_SUCCESS") {
          // redirect to FE payment success status page
          res.send(response.data);
        } else {
          // redirect to FE payment failure / pending status page
        }
      })
      .catch(function (error) {
        // redirect to FE payment failure / pending status page
        res.send(error);
      });
  } else {
    res.send("Sorry!! Error");
  }
};
