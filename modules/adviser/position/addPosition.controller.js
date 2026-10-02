const connection = require("../../../config/db"); // mysql2 pool with .promise()
const { resolveElection } = require("../shared/ballotConfig.service");

// Create a new position for an election (e.g. "President", "Senator")
exports.addPosition = async (req, res) => {
    try {
        const { election_id, title, max_selection, display_order } = req.body;

        if (!election_id || !title) {
            return res.status(400).json({ message: "election_id and title are required" });
        }

        const [electionRows] = await connection.execute(
            "SELECT election_id FROM elections WHERE election_id = ? LIMIT 1",
            [election_id],
        );
        if (electionRows.length === 0) {
            return res.status(404).json({ message: "Election not found" });
        }

        const [existing] = await connection.execute(
            "SELECT position_id FROM positions WHERE election_id = ? AND title = ? LIMIT 1",
            [election_id, title],
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: "A position with that title already exists for this election" });
        }

        const [result] = await connection.execute(
            "INSERT INTO positions (election_id, title, max_selection, display_order) VALUES (?, ?, ?, ?)",
            [election_id, title, max_selection || 1, display_order || 1],
        );

        return res.status(201).json({
            message: "Position added successfully",
            position: {
                position_id: result.insertId,
                election_id,
                title,
                max_selection: max_selection || 1,
                display_order: display_order || 1,
            },
        });
    } catch (error) {
        console.error("Add position error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// List positions for an election, in display order — each with its registered
// candidates attached, matching the "Registered Candidate" table grouped by position
exports.getPositions = async (req, res) => {
    try {
        // :election_id can be a number, or the word "current" for whichever election is newest
        const election = await resolveElection(req.params.election_id);
        if (!election) {
            return res.status(404).json({ message: "Election not found" });
        }
        const election_id = election.election_id;

        const [positions] = await connection.execute(
            "SELECT position_id, election_id, title, max_selection, display_order FROM positions WHERE election_id = ? ORDER BY display_order, position_id",
            [election_id],
        );

        const [candidates] = await connection.execute(
            `SELECT c.candidate_id, c.name, c.course, c.grade_level, c.party_list, c.position_id, c.display_order
             FROM candidates c
             JOIN positions p ON p.position_id = c.position_id
             WHERE p.election_id = ?
             ORDER BY c.position_id, c.display_order`,
            [election_id],
        );

        const result = positions.map((p) => ({
            ...p,
            candidates: candidates.filter((c) => c.position_id === p.position_id),
        }));

        return res.status(200).json({ positions: result });
    } catch (error) {
        console.error("Get positions error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Update a position's title, max_selection, or display_order
exports.updatePosition = async (req, res) => {
    try {
        const { position_id } = req.params;
        const { title, max_selection, display_order } = req.body;

        if (!title && max_selection == null && display_order == null) {
            return res.status(400).json({ message: "Provide at least one of title, max_selection, display_order" });
        }

        const [existing] = await connection.execute(
            "SELECT * FROM positions WHERE position_id = ? LIMIT 1",
            [position_id],
        );
        if (existing.length === 0) {
            return res.status(404).json({ message: "Position not found" });
        }

        const updated = {
            title: title ?? existing[0].title,
            max_selection: max_selection ?? existing[0].max_selection,
            display_order: display_order ?? existing[0].display_order,
        };

        await connection.execute(
            "UPDATE positions SET title = ?, max_selection = ?, display_order = ? WHERE position_id = ?",
            [updated.title, updated.max_selection, updated.display_order, position_id],
        );

        return res.status(200).json({ message: "Position updated successfully", position: { position_id: Number(position_id), ...updated } });
    } catch (error) {
        console.error("Update position error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Remove a position (cascades to its candidates, per the positions_ibfk_1 FK)
exports.deletePosition = async (req, res) => {
    try {
        const { position_id } = req.params;

        const [result] = await connection.execute(
            "DELETE FROM positions WHERE position_id = ?",
            [position_id],
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Position not found" });
        }

        return res.status(200).json({ message: "Position deleted successfully" });
    } catch (error) {
        console.error("Delete position error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};