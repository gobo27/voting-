// signin.router.js
const express = require("express");
const router = express.Router();
const authentication = require("./signin.controller");
const verifyToken = require("../sheared/middleware"); // Adjust path if needed
const { requireRole isAdviser, isCommittee} = require("../sheared/middleware"); // Imports role gates[cite: 8]

// Public endpoints
router.post("/", authentication.login); // Login endpoint[cite: 2, 3]

// Protected endpoints
router.post("/logout", authentication.logout); // Clear cookie[cite: 2, 3]
router.get("/me", verifyToken, authentication.me); // Authenticated current user check[cite: 2, 3, 8]

// Example role-restricted endpoints (add as needed):
// router.get("/admin-dashboard", verifyToken, isAdmin, controller.adminDashboard);
// router.get("/committee-action", verifyToken, requireRole("committee"), controller.committeeAction);

module.exports = router;