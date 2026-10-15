
const bcrypt = require("bcryptjs");
const connection = require("../../../config/db");

const ALLOWED_ROLES = ["committee", "adviser"];

const clean = value =>
    typeof value === "string" ? value.trim() : "";

const validEmail = email =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validId = id =>
    Number.isSafeInteger(Number(id)) && Number(id) > 0;

// CREATE ACCOUNT
exports.createAccount = async (req, res) => {
    try {
        const name = clean(req.body.name);
        const email = clean(req.body.email).toLowerCase();
        const password = req.body.password;
        const role = clean(req.body.role).toLowerCase();

        if (!name || !email || !password || !role) {
            return res.status(400).json({
                message: "Please complete all fields."
            });
        }

        if (name.length > 100 || email.length > 150 ||
            !validEmail(email)) {
            return res.status(400).json({
                message: "Invalid name or email."
            });
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({
                message: "Invalid account role."
            });
        }

        if (typeof password !== "string" ||
            password.length < 6 ||
            Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({
                message: "Password must be at least 6 characters and no more than 72 bytes."
            });
        }

        const [existing] = await connection.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        if (existing.length) {
            return res.status(409).json({
                message: "Email already exists."
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        const [result] = await connection.execute(
            `INSERT INTO users
             (name, email, password, role)
             VALUES (?, ?, ?, ?)`,
            [name, email, hashed, role]
        );

        return res.status(201).json({
            message: "Account created successfully.",
            user: {
                id: result.insertId,
                name,
                email,
                role
            }
        });

    } catch (error) {
        console.error("CREATE ACCOUNT ERROR:", error);
        return res.status(500).json({
            message: "Unable to create account."
        });
    }
};

// GET ACCOUNT LIST
exports.getAccounts = async (req, res) => {
    try {
        const [users] = await connection.execute(
            `SELECT id, name, email, role
             FROM users
             WHERE role IN ('committee', 'adviser')
             ORDER BY id DESC`
        );

        return res.status(200).json({ users });

    } catch (error) {
        console.error("GET ACCOUNTS ERROR:", error);
        return res.status(500).json({
            message: "Unable to load accounts."
        });
    }
};

// EDIT ACCOUNT
exports.updateAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const name = clean(req.body.name);
        const email = clean(req.body.email).toLowerCase();
        const role = clean(req.body.role).toLowerCase();
        const password = req.body.password;

        if (!validId(id)) {
            return res.status(400).json({
                message: "Invalid account ID."
            });
        }

        if (!name || !email || !role ||
            name.length > 100 ||
            email.length > 150 ||
            !validEmail(email)) {
            return res.status(400).json({
                message: "Valid name, email and role are required."
            });
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({
                message: "Invalid role."
            });
        }

        const [accounts] = await connection.execute(
            `SELECT id FROM users
             WHERE id = ?
             AND role IN ('committee', 'adviser')
             LIMIT 1`,
            [id]
        );

        if (!accounts.length) {
            return res.status(404).json({
                message: "Account not found."
            });
        }

        const [existing] = await connection.execute(
            `SELECT id FROM users
             WHERE email = ? AND id <> ?
             LIMIT 1`,
            [email, id]
        );

        if (existing.length) {
            return res.status(409).json({
                message: "Email already used by another account."
            });
        }

        if (password !== undefined &&
            password !== null &&
            password !== "") {

            if (typeof password !== "string" ||
                password.length < 6 ||
                Buffer.byteLength(password, "utf8") > 72) {
                return res.status(400).json({
                    message: "New password must be at least 6 characters and no more than 72 bytes."
                });
            }

            const hashed = await bcrypt.hash(password, 10);

            await connection.execute(
                `UPDATE users
                 SET name = ?, email = ?, role = ?, password = ?
                 WHERE id = ?
                 AND role IN ('committee', 'adviser')`,
                [name, email, role, hashed, id]
            );

        } else {
            await connection.execute(
                `UPDATE users
                 SET name = ?, email = ?, role = ?
                 WHERE id = ?
                 AND role IN ('committee', 'adviser')`,
                [name, email, role, id]
            );
        }

        return res.status(200).json({
            message: "Account updated successfully.",
            user: {
                id: Number(id),
                name,
                email,
                role
            }
        });

    } catch (error) {
        console.error("UPDATE ACCOUNT ERROR:", error);
        return res.status(500).json({
            message: "Unable to update account."
        });
    }
};

// DELETE ACCOUNT
exports.deleteAccount = async (req, res) => {
    try {
        const { id } = req.params;

        if (!validId(id)) {
            return res.status(400).json({
                message: "Invalid account ID."
            });
        }

        const [result] = await connection.execute(
            `DELETE FROM users
             WHERE id = ?
             AND role IN ('committee', 'adviser')`,
            [id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                message: "Account not found."
            });
        }

        return res.status(200).json({
            message: "Account deleted successfully."
        });

    } catch (error) {
        console.error("DELETE ACCOUNT ERROR:", error);
        return res.status(500).json({
            message: "Unable to delete account."
        });
    }
};
