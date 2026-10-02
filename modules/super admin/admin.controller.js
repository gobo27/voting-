const bcrypt = require("bcrypt");
const connection = require("../../config/db"); // mysql2 pool with .promise()

// Only an admin can create these two roles through this controller
const ALLOWED_ROLES = ["committee", "adviser"];

// Admin creates an account for a committee member or adviser
exports.createAccount = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: "name, email, password and role are required" });
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({ message: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
        }

        const [existing] = await connection.execute(
            "SELECT id FROM user WHERE email = ? LIMIT 1",
            [email],
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: "An account with that email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await connection.execute(
            "INSERT INTO user (name, email, password, role) VALUES (?, ?, ?, ?)",
            [name, email, hashedPassword, role],
        );

        return res.status(201).json({
            message: "Account created successfully",
            user: { id: result.insertId, name, email, role },
        });
    } catch (error) {
        console.error("Create account error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// List all committee/adviser accounts
exports.getAccounts = async (req, res) => {
    try {
        const [rows] = await connection.execute(
            "SELECT id, name, email, role FROM user WHERE role IN ('committee', 'adviser')",
        );
        return res.status(200).json({ users: rows });
    } catch (error) {
        console.error("Get accounts error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Remove a committee/adviser account
exports.deleteAccount = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await connection.execute(
            "DELETE FROM user WHERE id = ? AND role IN ('committee', 'adviser')",
            [id],
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Account not found" });
        }

        return res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        console.error("Delete account error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};