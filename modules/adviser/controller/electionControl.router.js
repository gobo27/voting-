
const express = require("express");
const router = express.Router();

const electionControl = require("./electionControl.controller");
const verifyToken = require("../../sheared/middleware");

// Public endpoints
router.get(
    "/:election_id/status",
    electionControl.getStatus
);

router.get(
    "/:election_id/candidates",
    electionControl.getPublicCandidates
);

// Protected endpoints
router.use(
    verifyToken,
    verifyToken.requireRole(
        "super_admin",
        "committee",
        "adviser"
    )
);

// Election schedule
router.patch(
    "/:election_id/schedule",
    electionControl.setSchedule
);

// Start election
router.post(
    "/:election_id/start",
    electionControl.startElection
);

// Stop voting
router.post(
    "/:election_id/stop",
    electionControl.stopVoting
);

// Mask candidate names
router.post(
    "/:election_id/mask",
    electionControl.toggleMaskNames
);

module.exports = router;
