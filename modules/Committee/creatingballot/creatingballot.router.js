
const express = require("express");
const router = express.Router();

const ballotController = require("./creatingballot.controller");
const verifyToken = require("../../sheared/middleware");

router.use(
    verifyToken,
    verifyToken.requireRole(
        "super_admin",
        "committee",
        "adviser"
    )
);

// Create ballot template
router.post(
    "/templates",
    ballotController.createTemplate
);

// Create complete OMR ballot template
router.post(
    "/templates/complete",
    ballotController.createCompleteTemplate
);

// Get templates by election ID or "current"
router.get(
    "/templates/election/:election_id",
    ballotController.getTemplatesByElection
);

// Get a specific ballot template
router.get(
    "/templates/:template_id",
    ballotController.getTemplate
);

// Add OMR coordinate to an existing template
router.post(
    "/templates/:template_id/coordinates",
    ballotController.addGridCoordinate
);

module.exports = router;
