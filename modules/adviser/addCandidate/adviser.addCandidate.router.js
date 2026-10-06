const express = require("express");
const router = express.Router();
const candidateController = require("./adviser.addCandidate");
const verifyToken = require("../../sheared/middleware"); // Inayos ang typo

router.use(verifyToken);

router.get("/", candidateController.getCandidates);
router.post("/", candidateController.addCandidate);
router.delete("/:id", candidateController.deleteCandidate);

module.exports = router;