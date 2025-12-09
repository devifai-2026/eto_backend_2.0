import { Router } from "express";
import { getETOCardById, updateManyETOCards } from "../controllers/etoController.js";

const router = Router();

router.route("/:id").get(getETOCardById);
router.route("/update-many").patch(updateManyETOCards);

export default router;
