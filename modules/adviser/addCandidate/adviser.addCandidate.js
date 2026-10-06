const connection = require("../../../config/db");

// 1. GET ALL CANDIDATES
exports.getCandidates = async (req, res) => {
    try {
        const [rows] = await connection.execute(
            `SELECT c.*, p.title AS position_title 
             FROM candidates c 
             JOIN positions p ON p.position_id = c.position_id 
             ORDER BY p.display_order, c.display_order`
        );
        return res.status(200).json({ candidates: rows });
    } catch (error) {
        console.error("Get candidates error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// 2. ADD CANDIDATE
exports.addCandidate = async (req, res) => {
    try {
        const { name, course, grade_level, party_list, position_id, display_order } = req.body;

        if (!name || !position_id) {
            return res.status(400).json({ message: "Name and position_id are required." });
        }

        const [positionRows] = await connection.execute(
            "SELECT position_id, election_id FROM positions WHERE position_id = ? LIMIT 1",
            [position_id]
        );
        if (positionRows.length === 0) {
            return res.status(404).json({ message: "Position not found." });
        }

        const election_id = positionRows[0].election_id;

        const [result] = await connection.execute(
            `INSERT INTO candidates (election_id, name, course, grade_level, party_list, position_id, display_order) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [election_id, name, course || null, grade_level || null, party_list || null, position_id, display_order || 1]
        );

        return res.status(201).json({
            message: "Candidate added successfully",
            candidate: {
                candidate_id: result.insertId,
                election_id,
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

// 3. DELETE CANDIDATE
exports.deleteCandidate = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await connection.execute(
            "DELETE FROM candidates WHERE candidate_id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Candidate not found." });
        }

        return res.status(200).json({ message: "Candidate deleted successfully." });
    } catch (error) {
        console.error("Delete candidate error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};