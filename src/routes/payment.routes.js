import { Router } from "express";
import { checkStatus, createPayment } from "../controllers/newpaymentcontroller.js";

const router = Router();

router.get("/pay", createPayment);
router.get("/redirect-url/:merchantTransactionId", checkStatus);

export default router;
