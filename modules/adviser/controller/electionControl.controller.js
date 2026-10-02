const connection = require("../../../config/db"); // mysql2 pool with .promise()

// --- Public endpoints (no login required — the live dashboard polls these) ---

// Current control-panel state: status, schedule, whether names are masked
exports.getStatus = async (req, res) => {
    try {
        const { election_id } = req.params;

        const [rows] = await connection.execute(
            "SELECT election_id, title, start_time, end_time, status, is_active, mask_names FROM elections WHERE election_id = ? LIMIT 1",
            [election_id],
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: "Election not found" });
        }

        return res.status(200).json({ election: rows[0] });
    } catch (error) {
        console.error("Get election status error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Candidate list for the dashboard, names replaced with a placeholder when masked
exports.getPublicCandidates = async (req, res) => {
    try {
        const { election_id } = req.params;

        const [electionRows] = await connection.execute(
            "SELECT mask_names FROM elections WHERE election_id = ? LIMIT 1",
            [election_id],
        );
        if (electionRows.length === 0) {
            return res.status(404).json({ message: "Election not found" });
        }
        const maskNames = !!electionRows[0].mask_names;

        const [rows] = await connection.execute(
            `SELECT c.candidate_id, c.name, c.course, c.grade_level, c.party_list,
                    c.position_id, c.display_order, p.title AS position_title
             FROM candidates c
             JOIN positions p ON p.position_id = c.position_id
             WHERE p.election_id = ?
             ORDER BY p.display_order, c.display_order`,
            [election_id],
        );

        const candidates = rows.map((c) => ({
            ...c,
            name: maskNames ? `Candidate #${c.candidate_id}` : c.name,
        }));

        return res.status(200).json({ mask_names: maskNames, candidates });
    } catch (error) {
        console.error("Get public candidates error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// --- Protected endpoints (committee/super_admin only — see router) ---

// Set the scheduled starting and closing time
exports.setSchedule = async (req, res) => {
    try {
        const { election_id } = req.params;
        const { start_time, end_time } = req.body;

        if (!start_time || !end_time) {
            return res.status(400).json({ message: "start_time and end_time are required" });
        }
        if (new Date(start_time) >= new Date(end_time)) {
            return res.status(400).json({ message: "start_time must be before end_time" });
        }

        const [result] = await connection.execute(
            "UPDATE elections SET start_time = ?, end_time = ? WHERE election_id = ?",
            [start_time, end_time, election_id],
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Election not found" });
        }

        return res.status(200).json({ message: "Election schedule updated" });
    } catch (error) {
        console.error("Set schedule error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// "Start Election" — manually trigger election start
exports.startElection = async (req, res) => {
    try {
        const { election_id } = req.params;

        // Can't restart something that's been permanently stopped
        const [result] = await connection.execute(
            "UPDATE elections SET status = 'active', is_active = 1 WHERE election_id = ? AND status != 'completed'",
            [election_id],
        );
        if (result.affectedRows === 0) {
            return res.status(409).json({ message: "Election not found, or it has already been permanently stopped" });
        }

        return res.status(200).json({ message: "Election started" });
    } catch (error) {
        console.error("Start election error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// "Stop Voting" — permanently ends the election, cannot be restarted
exports.stopVoting = async (req, res) => {
    try {
        const { election_id } = req.params;

        const [result] = await connection.execute(
            "UPDATE elections SET status = 'completed', is_active = 0 WHERE election_id = ?",
            [election_id],
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Election not found" });
        }

        return res.status(200).json({ message: "Voting stopped permanently" });
    } catch (error) {
        console.error("Stop voting error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// "Mask Names" — toggle hiding candidates' real names
exports.toggleMaskNames = async (req, res) => {
    try {
        const { election_id } = req.params;

        const [rows] = await connection.execute(
            "SELECT mask_names FROM elections WHERE election_id = ? LIMIT 1",
            [election_id],
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: "Election not found" });
        }

        const newValue = rows[0].mask_names ? 0 : 1;
        await connection.execute(
            "UPDATE elections SET mask_names = ? WHERE election_id = ?",
            [newValue, election_id],
        );

        return res.status(200).json({ message: "Mask names updated", mask_names: !!newValue });
    } catch (error) {
        console.error("Toggle mask names error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};