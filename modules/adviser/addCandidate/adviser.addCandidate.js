const connection = require("../../../config/db"); // mysql2 pool with .promise()

// 1. ADD CANDIDATE (POST)
exports.addCandidate = async (req, res) => {
    try {
        const { name, course, grade_level, party_list, position_id, display_order } = req.body;

        if (!name || !position_id) {
            return res.status(400).json({ message: "name and position_id are required" });
        }

        // Position must exist
        const [positionRows] = await connection.execute(
            "SELECT position_id FROM positions WHERE position_id = ? LIMIT 1",
            [position_id]
        );
        if (positionRows.length === 0) {
            return res.status(404).json({ message: "Position not found" });
        }

        const [result] = await connection.execute(
            "INSERT INTO candidates (name, course, grade_level, party_list, position_id, display_order) VALUES (?, ?, ?, ?, ?, ?)",
            [name, course || null, grade_level || null, party_list || null, position_id, display_order || 1]
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

// 2. UPDATE CANDIDATE (PUT)
exports.updateCandidate = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, course, grade_level, party_list, position_id, display_order } = req.body;

        if (!name || !position_id) {
            return res.status(400).json({ message: "name and position_id are required" });
        }

        const [result] = await connection.execute(
            `UPDATE candidates 
             SET name = ?, course = ?, grade_level = ?, party_list = ?, position_id = ?, display_order = ?
             WHERE candidate_id = ?`,
            [name, course || null, grade_level || null, party_list || null, position_id, display_order || 1, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({ message: "Candidate updated successfully" });
    } catch (error) {
        console.error("Update candidate error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// 3. DELETE CANDIDATE (DELETE)
exports.deleteCandidate = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await connection.execute(
            "DELETE FROM candidates WHERE candidate_id = ?",
            [id]
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