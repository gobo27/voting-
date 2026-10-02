const connection = require("../../config/db"); // mysql2 pool with .promise()

async function getElectionOrFail(election_id, res) {
    const [rows] = await connection.execute(
        "SELECT election_id, title, start_time, end_time, status, is_active, mask_names FROM elections WHERE election_id = ? LIMIT 1",
        [election_id],
    );
    if (rows.length === 0) {
        res.status(404).json({ message: "Election not found" });
        return null;
    }
    return rows[0];
}

// Election header info: title, schedule, status, whether names are currently masked
exports.getElectionStatus = async (req, res) => {
    try {
        const { election_id } = req.params;
        const election = await getElectionOrFail(election_id, res);
        if (!election) return;
        return res.status(200).json({ election });
    } catch (error) {
        console.error("Get dashboard election status error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Candidates for this election, grouped by position. Any candidate an adviser adds
// via adviser.addCandidate shows up here automatically — this reads live from the
// candidates table, no separate step needed to "publish" them to the dashboard.
exports.getCandidates = async (req, res) => {
    try {
        const { election_id } = req.params;
        const election = await getElectionOrFail(election_id, res);
        if (!election) return;

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
            name: election.mask_names ? `Candidate #${c.candidate_id}` : c.name,
        }));

        return res.status(200).json({ mask_names: !!election.mask_names, candidates });
    } catch (error) {
        console.error("Get dashboard candidates error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Live vote tallies. Reads straight from v_live_tallies, so every vote the OMR
// module records via ballot_votes shows up here the moment it's inserted.
exports.getTallies = async (req, res) => {
    try {
        const { election_id } = req.params;
        const election = await getElectionOrFail(election_id, res);
        if (!election) return;

        const [rows] = await connection.execute(
            "SELECT * FROM v_live_tallies WHERE election_id = ? ORDER BY position_id, total_votes DESC",
            [election_id],
        );

        const tallies = rows.map((t) => ({
            ...t,
            candidate_name: election.mask_names ? `Candidate #${t.candidate_id}` : t.candidate_name,
        }));

        return res.status(200).json({ mask_names: !!election.mask_names, tallies });
    } catch (error) {
        console.error("Get dashboard tallies error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// One combined payload for a dashboard page: election info + candidates grouped by
// position, each with its running vote count already attached.
exports.getOverview = async (req, res) => {
    try {
        const { election_id } = req.params;
        const election = await getElectionOrFail(election_id, res);
        if (!election) return;

        const [candidateRows] = await connection.execute(
            `SELECT c.candidate_id, c.name, c.course, c.grade_level, c.party_list,
                    c.position_id, c.display_order, p.title AS position_title
             FROM candidates c
             JOIN positions p ON p.position_id = c.position_id
             WHERE p.election_id = ?
             ORDER BY p.display_order, c.display_order`,
            [election_id],
        );

        const [tallyRows] = await connection.execute(
            "SELECT position_id, candidate_id, total_votes FROM v_live_tallies WHERE election_id = ?",
            [election_id],
        );
        const votesByCandidate = {};
        for (const t of tallyRows) {
            votesByCandidate[t.candidate_id] = t.total_votes;
        }

        const positions = {};
        for (const c of candidateRows) {
            if (!positions[c.position_id]) {
                positions[c.position_id] = {
                    position_id: c.position_id,
                    position_title: c.position_title,
                    candidates: [],
                };
            }
            positions[c.position_id].candidates.push({
                candidate_id: c.candidate_id,
                name: election.mask_names ? `Candidate #${c.candidate_id}` : c.name,
                course: c.course,
                grade_level: c.grade_level,
                party_list: c.party_list,
                total_votes: votesByCandidate[c.candidate_id] || 0,
            });
        }

        return res.status(200).json({
            election,
            positions: Object.values(positions),
        });
    } catch (error) {
        console.error("Get dashboard overview error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};