const express = require("express");
const router = express.Router();
const dashboardController = require("./dashboard.controller");

// Everything here is public — this is what the live results dashboard reads from.
// Poll these on an interval from the frontend to keep the display "live".
router.get("/:election_id/status", dashboardController.getElectionStatus);
router.get("/:election_id/candidates", dashboardController.getCandidates);
router.get("/:election_id/tallies", dashboardController.getTallies);
router.get("/:election_id/overview", dashboardController.getOverview);

module.exports = router;