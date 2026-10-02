const express = require("express");
const router = express.Router();
const ballotController = require("./creatingballot.controller");
const verifyToken = require("../../sheared/middleware");

router.use(verifyToken, verifyToken.requireRole("super_admin", "committee"));

router.post("/templates", ballotController.createTemplate);
router.get("/templates/election/:election_id", ballotController.getTemplatesByElection);
router.get("/templates/:template_id", ballotController.getTemplate);
router.post("/templates/:template_id/coordinates", ballotController.addGridCoordinate);

module.exports = router;