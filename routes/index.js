const express = require('express');
router = express.Router();

// Ensure these relative paths match where THIS file is located relative to 'modules'
const signinRoutes = require("../modules/signin/signin.router");
const adminRoutes = require("../modules/super admin/admin.router");
const candidateRoutes = require("../modules/adviser/addCandidate/adviser.addCandidate.router");
const positionRoutes = require("../modules/adviser/position/addPosition.router");
const electionControlRoutes = require("../modules/adviser/controller/electionControl.router");
const ballotRoutes = require("../modules/Committee/creatingballot/creatingballot.router");
const omrRoutes = require("../modules/Committee/OMR/omr.router");
const dashboardRoutes = require("../modules/dashboard/dashboard.router");

router.use("/signin",signinRoutes);
router.use("/createAccount", adminRoutes);
router.use("/candidates", candidateRoutes);
router.use("/positions", positionRoutes);
router.use("/election", electionControlRoutes);
router.use("/ballots", ballotRoutes);
router.use("/omr", omrRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;