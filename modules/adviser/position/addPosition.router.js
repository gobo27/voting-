const express = require("express");
const router = express.Router();
const positionController = require("./addPosition.controller");
const verifyToken = require("../../sheared/middleware");

router.use(verifyToken, verifyToken.requireRole("super_admin", "committee", "adviser"));

router.get("/election/:election_id", positionController.getPositions);

router.use(verifyToken.requireRole("super_admin", "committee"));
router.post("/", positionController.addPosition);
router.patch("/:position_id", positionController.updatePosition);
router.delete("/:position_id", positionController.deletePosition);

module.exports = router;