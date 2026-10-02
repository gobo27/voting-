const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const connection = require("../../config/db"); // mysql2 pool with .promise()
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Standardized to 'users' table
        const [rows] = await connection.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            [email],
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Password" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60 * 1000,
        });

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.logout = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    });
    return res.status(200).json({ message: "Logged out successfully" });
};

exports.me = (req, res) => {
    return res.status(200).json({ user: req.user });
};

// exports.register = async (req, res) => {
//     try {
//         const { name, email, password, role } = req.body;

//         if (!name || !email || !password || !role) {
//             return res.status(400).json({ message: "All fields are required" });
//         }

//         const hashedPassword = await bcrypt.hash(password, 10);

//         // Standardized to 'users' table
//         const [result] = await connection.execute(
//             "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
//             [name, email, hashedPassword, role]
//         );

//         return res.status(201).json({
//             message: "User registered successfully!",
//             userId: result.insertId
//         });
//     } catch (error) {
//         console.error("Register error:", error);
//         return res.status(500).json({ message: "Internal server error" });
//     }
// };