const express = require("express");
const router = express.Router();
const electionControl = require("./electionControl.controller");
const verifyToken = require("../../sheared/middleware");

// --- Public: the live dashboard polls these, no login needed ---
router.get("/:election_id/status", electionControl.getStatus);
router.get("/:election_id/candidates", electionControl.getPublicCandidates);

// --- Everything below requires a valid token AND super_admin or committee role ---
router.use(verifyToken, verifyToken.requireRole("super_admin", "committee"));

router.patch("/:election_id/schedule", electionControl.setSchedule);
router.post("/:election_id/start", electionControl.startElection);
router.post("/:election_id/stop", electionControl.stopVoting);
router.post("/:election_id/mask", electionControl.toggleMaskNames);

module.exports = router;