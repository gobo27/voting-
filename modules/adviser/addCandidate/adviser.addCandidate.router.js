
const express = require("express");
const router = express.Router();

const candidateController = require("./adviser.addCandidate");

const verifyToken = require("../../sheared/middleware");

// Require a valid login token
router.use(verifyToken);

// Get candidates from current election
router.get("/", candidateController.getCandidates);
// Add candidate to current election
router.post("/", candidateController.addCandidate);
// Edit candidate from current election
router.put("/:id", candidateController.updateCandidate);
// Delete candidate from current election
router.delete("/:id", candidateController.deleteCandidate);
module.exports = router;
