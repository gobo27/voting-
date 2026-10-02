const express = require("express");
const router = express.Router();
const candidateController = require("./adviser.addCandidate");
const verifyToken = require("../../sheared/middleware");

// Require authentication & adviser verification
router.use(verifyToken);

// Routes for Add, Update, and Delete ONLY
router.post("/", candidateController.addCandidate);       // ADD
router.put("/:id", candidateController.updateCandidate);  // UPDATE
router.delete("/:id", candidateController.deleteCandidate); // DELETE

module.exports = router;