
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../modules/sheared/middleware");
const controller = require("./electionArchive.controller");

// Only Super Admin can access this module.
router.use(
    verifyToken,
    verifyToken.requireRole("super_admin")
);

// View all election cycles
router.get("/", controller.list);

// Archive completed election
router.post("/:id/archive", controller.archive);

// Create new election cycle
router.post("/", controller.create);


module.exports = router;