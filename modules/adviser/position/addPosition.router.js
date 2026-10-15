
const express = require("express");
const router = express.Router();

const positionController = require("./addPosition.controller");
const verifyToken = require("../../sheared/middleware");

// All routes require authentication.
router.use(verifyToken);

// Get positions from a specific or current election.
router.get(
    "/election/:election_id",
    verifyToken.requireRole(
        "super_admin",
        "committee",
        "adviser"
    ),
    positionController.getPositions
);

// Add or reuse a position.
router.post(
    "/",
    verifyToken.requireRole(
        "super_admin",
        "committee",
        "adviser"
    ),
    positionController.addPosition
);

// Edit position.
router.patch(
    "/:position_id",
    verifyToken.requireRole(
        "super_admin",
        "committee"
    ),
    positionController.updatePosition
);

// Delete position.
router.delete(
    "/:position_id",
    verifyToken.requireRole(
        "super_admin",
        "committee"
    ),
    positionController.deletePosition
);

module.exports = router;
