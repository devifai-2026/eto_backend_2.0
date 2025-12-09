import { Router } from "express";
import { createRatings, getAllRatings, getRatingsById } from "../controllers/rating.controller.js";

const router = Router();

router.route("/").get(getAllRatings);
router.route("/:driverUserId").get(getRatingsById);
router.route("/addRating").post(createRatings);


export default router;
