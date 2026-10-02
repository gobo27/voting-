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
// Fetch one candidate by its database ID.
exports.getCandidateById = async (req, res) => {
    try {
        const [rows] = await connection.execute(
            'SELECT c.*, p.title AS position_title FROM candidates c JOIN positions p ON p.position_id = c.position_id WHERE c.candidate_id = ? LIMIT 1',
            [req.params.id],
        );
        if (!rows.length) return res.status(404).json({ message: 'Candidate not found' });
        return res.status(200).json({ candidate: rows[0] });
    } catch (error) {
        console.error('Get candidate error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// Update only supplied fields, preserving the rest of the candidate record.
exports.updateCandidate = async (req, res) => {
    try {
        const fields = ['name', 'course', 'grade_level', 'party_list', 'position_id', 'display_order'];
        const body = req.body || {};
        const supplied = fields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
        if (!supplied.length) return res.status(400).json({ message: 'Provide at least one candidate field to update' });
        if (supplied.includes('name') && (typeof body.name !== 'string' || !body.name.trim())) {
            return res.status(400).json({ message: 'name is required' });
        }
        if (supplied.includes('display_order') && (!Number.isInteger(Number(body.display_order)) || Number(body.display_order) < 1)) {
            return res.status(400).json({ message: 'display_order must be a positive integer' });
        }
        const [rows] = await connection.execute('SELECT * FROM candidates WHERE candidate_id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ message: 'Candidate not found' });
        if (supplied.includes('position_id')) {
            if (!Number.isInteger(Number(body.position_id)) || Number(body.position_id) < 1) {
                return res.status(400).json({ message: 'position_id must be a positive integer' });
            }
            const [positions] = await connection.execute('SELECT position_id FROM positions WHERE position_id = ? LIMIT 1', [body.position_id]);
            if (!positions.length) return res.status(404).json({ message: 'Position not found' });
        }
        const updated = { ...rows[0] };
        for (const field of supplied) updated[field] = ['course', 'grade_level', 'party_list'].includes(field) ? (body[field] || null) : body[field];
        await connection.execute(
            'UPDATE candidates SET name = ?, course = ?, grade_level = ?, party_list = ?, position_id = ?, display_order = ? WHERE candidate_id = ?',
            [...fields.map(field => updated[field]), req.params.id],
        );
        return res.status(200).json({ message: 'Candidate updated successfully', candidate: updated });
    } catch (error) {
        console.error('Update candidate error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
