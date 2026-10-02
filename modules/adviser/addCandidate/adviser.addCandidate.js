const connection = require("../../../config/db"); // mysql2 pool with .promise()

// Adviser adds a candidate directly (no separate voter record to link to)
exports.addCandidate = async (req, res) => {
    try {
        const { name, course, grade_level, party_list, position_id, display_order } = req.body;

        if (!name || !position_id) {
            return res.status(400).json({ message: "name and position_id are required" });
        }

        // Position must exist
        const [positionRows] = await connection.execute(
            "SELECT position_id FROM positions WHERE position_id = ? LIMIT 1",
            [position_id],
        );
        if (positionRows.length === 0) {
            return res.status(404).json({ message: "Position not found" });
        }

        const [result] = await connection.execute(
            "INSERT INTO candidates (name, course, grade_level, party_list, position_id, display_order) VALUES (?, ?, ?, ?, ?, ?)",
            [name, course || null, grade_level || null, party_list || null, position_id, display_order || 1],
        );

        return res.status(201).json({
            message: "Candidate added successfully",
            candidate: {
                candidate_id: result.insertId,
                name,
                course: course || null,
                grade_level: grade_level || null,
                party_list: party_list || null,
                position_id,
                display_order: display_order || 1,
            },
        });
    } catch (error) {
        console.error("Add candidate error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// List candidates, optionally filtered by ?position_id=
exports.getCandidates = async (req, res) => {
    try {
        const { position_id } = req.query;

        let query = `
            SELECT c.candidate_id, c.name, c.course, c.grade_level, c.party_list,
                   c.position_id, c.display_order, p.title AS position_title
            FROM candidates c
            JOIN positions p ON p.position_id = c.position_id
        `;
        const params = [];
        if (position_id) {
            query += " WHERE c.position_id = ?";
            params.push(position_id);
        }
        query += " ORDER BY c.position_id, c.display_order";

        const [rows] = await connection.execute(query, params);
        return res.status(200).json({ candidates: rows });
    } catch (error) {
        console.error("Get candidates error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Remove a candidate
exports.deleteCandidate = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await connection.execute(
            "DELETE FROM candidates WHERE candidate_id = ?",
            [id],
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({ message: "Candidate deleted successfully" });
    } catch (error) {
        console.error("Delete candidate error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};