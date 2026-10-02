const express = require("express");
const router = express.Router();
const candidateController = require("./adviser.addCandidate");
const verifyToken = require("../../sheared/middleware");

// Every route below requires a valid token AND the adviser role
router.use(verifyToken, verifyToken.isAdviser);

router.post("/", candidateController.addCandidate);
router.get("/", candidateController.getCandidates);
router.get("/:id", candidateController.getCandidateById);
router.put("/:id", candidateController.updateCandidate);
router.delete("/:id", candidateController.deleteCandidate);

module.exports = router;