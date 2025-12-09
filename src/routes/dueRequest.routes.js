import { Router } from "express";
import {
  createDueRequest,
  deleteDueRequest,
  getAllPendingDueRequests,
  getDueRequestDetails,
  updateDueRequestStatus,
} from "../controllers/dueRequest.controller.js";

const router = Router();

router.route("/createDueRequest").post(createDueRequest);
router.route("/pendingDueRequest").get(getAllPendingDueRequests);
router.route("/getDueRequestDetails/:dueRequestId").get(getDueRequestDetails);
router
  .route("/updateDueRequestStatus/:dueRequestId")
  .patch(updateDueRequestStatus);
router.route("delete/:dueRequestId").delete(deleteDueRequest);

export default router;
