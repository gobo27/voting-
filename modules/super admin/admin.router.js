const express = require("express");
const router = express.Router();
const adminController = require("./admin.controller");
const verifyToken = require("../sheared/middleware");

// Every route below requires a valid token AND an admin role
router.use(verifyToken, verifyToken.isAdmin);

// Admin creates an account for a committee member or adviser
router.post("/accounts", adminController.createAccount);

// List committee/adviser accounts
router.get("/accounts", adminController.getAccounts);

// Remove a committee/adviser account
router.delete("/accounts/:id", adminController.deleteAccount);

module.exports = router;