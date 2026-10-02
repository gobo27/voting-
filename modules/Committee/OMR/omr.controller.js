const crypto = require("crypto");
const sharp = require("sharp");
const connection = require("../../../config/db"); // mysql2 pool with .promise()

// How dark (0 = white, 255 = black) a bubble's average pixel value must be
// to count as filled in. This is a starting point — tune it against real scans.
const FILL_DARKNESS_THRESHOLD = 120;

// Upload a scanned ballot image and immediately process it
exports.uploadAndProcess = async (req, res) => {
    try {
        const { election_id, template_id } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "A ballot image file is required (field name: ballot_image)" });
        }
        if (!election_id || !template_id) {
            return res.status(400).json({ message: "election_id and template_id are required" });
        }

        const [templateRows] = await connection.execute(
            "SELECT template_id FROM ballot_templates WHERE template_id = ? AND election_id = ? LIMIT 1",
            [template_id, election_id],
        );
        if (templateRows.length === 0) {
            return res.status(404).json({ message: "Ballot template not found for this election" });
        }

        const ballot_id = crypto.randomUUID();
        const scanner_user_id = req.user?.id || null;
        const ballot_image_path = req.file.path;

        await connection.execute(
            "INSERT INTO scanned_ballots (ballot_id, election_id, scanner_user_id, ballot_image_path) VALUES (?, ?, ?, ?)",
            [ballot_id, election_id, scanner_user_id, ballot_image_path],
        );

        const result = await processBallotImage(ballot_id, template_id, ballot_image_path);

        return res.status(201).json({
            message: "Ballot scanned and votes recorded",
            ballot_id,
            votes_recorded: result.votesRecorded,
            positions: result.positions,
        });
    } catch (error) {
        console.error("Upload/process ballot error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Reads each bubble region from the image and records a vote for filled-in bubbles.
// NOTE: this assumes the uploaded image is already the same pixel dimensions/orientation
// the template's coordinates were defined against — it does not correct for skew or
// misalignment from the scanner. Real OMR pipelines add registration marks and an
// alignment step for that; that's a follow-up if your scans come in rotated/skewed.
async function processBallotImage(ballot_id, template_id, imagePath) {
    const [coordinates] = await connection.execute(
        `SELECT g.coord_id, g.candidate_id, g.x_pos, g.y_pos, g.width, g.height, c.position_id, p.max_selection
         FROM omr_grid_coordinates g
         JOIN candidates c ON c.candidate_id = g.candidate_id
         JOIN positions p ON p.position_id = c.position_id
         WHERE g.template_id = ?`,
        [template_id],
    );

    const metadata = await sharp(imagePath).metadata();

    const readings = [];
    for (const coord of coordinates) {
        const x = Math.max(0, Math.min(coord.x_pos, metadata.width - 1));
        const y = Math.max(0, Math.min(coord.y_pos, metadata.height - 1));
        const width = Math.max(1, Math.min(coord.width, metadata.width - x));
        const height = Math.max(1, Math.min(coord.height, metadata.height - y));

        const { data } = await sharp(imagePath)
            .grayscale()
            .extract({ left: x, top: y, width, height })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const avgDarkness = 255 - data.reduce((sum, val) => sum + val, 0) / data.length;
        const fillIntensity = Math.round((avgDarkness / 255) * 100 * 100) / 100; // 0-100, 2dp

        readings.push({
            candidate_id: coord.candidate_id,
            position_id: coord.position_id,
            max_selection: coord.max_selection,
            fillIntensity,
            filled: avgDarkness >= FILL_DARKNESS_THRESHOLD,
        });
    }

    // Group by position, keep only the top `max_selection` filled bubbles per position
    const byPosition = {};
    for (const r of readings) {
        if (!byPosition[r.position_id]) byPosition[r.position_id] = [];
        byPosition[r.position_id].push(r);
    }

    let votesRecorded = 0;
    const positionsSummary = [];

    for (const [position_id, candidates] of Object.entries(byPosition)) {
        const filled = candidates.filter((c) => c.filled).sort((a, b) => b.fillIntensity - a.fillIntensity);
        const maxSelection = candidates[0]?.max_selection || 1;
        const toRecord = filled.slice(0, maxSelection); // extra marks beyond max_selection are dropped as an overvote

        for (const vote of toRecord) {
            await connection.execute(
                "INSERT INTO ballot_votes (ballot_id, candidate_id, position_id, fill_intensity) VALUES (?, ?, ?, ?)",
                [ballot_id, vote.candidate_id, position_id, vote.fillIntensity],
            );
            votesRecorded += 1;
        }

        positionsSummary.push({
            position_id: Number(position_id),
            marked: filled.length,
            recorded: toRecord.length,
            overvoted: filled.length > maxSelection,
        });
    }

    return { votesRecorded, positions: positionsSummary };
}

// Live tallies for the dashboard. This reads straight from the v_live_tallies view,
// so it reflects every processed ballot immediately — the dashboard just needs to
// poll this on an interval (e.g. every few seconds) to look "live".
exports.getLiveTallies = async (req, res) => {
    try {
        const { election_id } = req.params;
        const [rows] = await connection.execute(
            "SELECT * FROM v_live_tallies WHERE election_id = ? ORDER BY position_id, total_votes DESC",
            [election_id],
        );
        return res.status(200).json({ tallies: rows });
    } catch (error) {
        console.error("Get live tallies error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};