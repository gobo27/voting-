
const crypto = require("crypto");
const sharp = require("sharp");
const pool = require("../../../config/db");

const EXPECTED_WIDTH = 2480;
const EXPECTED_HEIGHT = 1754;

const DARK_LIMIT = 110;
const MIN_FILL_PERCENT = 60;

function validId(value) {
    return Number.isSafeInteger(Number(value)) &&
        Number(value) > 0;
}

// =====================================
// GET TEMPLATE AND SAVED COORDINATES
// =====================================
async function getTemplateCoordinates(
    db,
    templateId,
    electionId
) {
    const [templates] = await db.execute(
        `SELECT template_id, election_id, paper_size
         FROM ballot_templates
         WHERE template_id = ?
         AND election_id = ?
         LIMIT 1`,
        [templateId, electionId]
    );

    if (!templates.length) {
        return null;
    }

    const [coordinates] = await db.execute(
        `SELECT
            g.coord_id,
            g.candidate_id,
            g.bubble_code,
            g.x_pos,
            g.y_pos,
            g.width,
            g.height,
            c.name AS candidate_name,
            c.position_id,
            p.title AS position_name,
            p.max_selection
         FROM omr_grid_coordinates g
         JOIN candidates c
            ON c.candidate_id = g.candidate_id
         JOIN positions p
            ON p.position_id = c.position_id
         WHERE g.template_id = ?
         AND p.election_id = ?
         ORDER BY p.position_id, g.y_pos, g.x_pos`,
        [templateId, electionId]
    );

    return {
        template: templates[0],
        coordinates
    };
}

// =====================================
// SCAN AND PROCESS BALLOT
// =====================================
exports.uploadAndProcess = async (req, res) => {
    let db;
    let transactionStarted = false;

    try {
        const electionId = Number(req.body.election_id);
        const templateId = Number(req.body.template_id);

        if (
            !req.file ||
            !validId(electionId) ||
            !validId(templateId)
        ) {
            return res.status(400).json({
                message:
                    "Valid election_id, template_id and ballot_image are required."
            });
        }

        db = await pool.getConnection();

        const record = await getTemplateCoordinates(
            db,
            templateId,
            electionId
        );

        if (!record) {
            return res.status(404).json({
                message: "Template not found for this election."
            });
        }

        if (record.template.paper_size !== "A5") {
            return res.status(422).json({
                message: "Scanner requires an A5 template."
            });
        }

        if (!record.coordinates.length) {
            return res.status(422).json({
                message: "Template has no saved OMR coordinates."
            });
        }

        // Read image as grayscale.
        const { data, info } = await sharp(req.file.path)
            .rotate()
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        if (
            info.width !== EXPECTED_WIDTH ||
            info.height !== EXPECTED_HEIGHT
        ) {
            return res.status(422).json({
                message:
                    `Expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}px ` +
                    `but received ${info.width}x${info.height}px. ` +
                    "No votes recorded."
            });
        }

        const grouped = new Map();

        // =====================================
        // READ EVERY SAVED BUBBLE
        // =====================================
        for (const coord of record.coordinates) {
            const x = Number(coord.x_pos);
            const y = Number(coord.y_pos);
            const w = Number(coord.width);
            const h = Number(coord.height);

            if (
                ![x, y, w, h].every(Number.isInteger) ||
                x < 0 ||
                y < 0 ||
                w < 3 ||
                h < 3 ||
                x + w > info.width ||
                y + h > info.height
            ) {
                return res.status(422).json({
                    message:
                        `Invalid coordinates for candidate ` +
                        `${coord.candidate_id}. No votes recorded.`
                });
            }

            const left = x + Math.floor(w * 0.28);
            const top = y + Math.floor(h * 0.28);
            const right = x + Math.ceil(w * 0.72);
            const bottom = y + Math.ceil(h * 0.72);

            let dark = 0;
            let total = 0;

            for (let yy = top; yy < bottom; yy++) {
                for (let xx = left; xx < right; xx++) {
                    if (
                        data[yy * info.width + xx] <
                        DARK_LIMIT
                    ) {
                        dark++;
                    }

                    total++;
                }
            }

            const percentage = total
                ? (dark / total) * 100
                : 0;

            const positionId = Number(coord.position_id);

            if (!grouped.has(positionId)) {
                grouped.set(positionId, {
                    position_id: positionId,
                    position_name: coord.position_name,
                    max_selection:
                        Number(coord.max_selection) || 1,
                    candidates: []
                });
            }

            grouped.get(positionId).candidates.push({
                candidate_id: Number(coord.candidate_id),
                name: coord.candidate_name,
                filled: percentage >= MIN_FILL_PERCENT,
                fill_intensity:
                    Math.round(percentage * 100) / 100
            });
        }

        // =====================================
        // CHECK OVERVOTES
        // =====================================
        const positions = [...grouped.values()].map(
            position => {
                const marked = position.candidates.filter(
                    candidate => candidate.filled
                );

                const overvoted =
                    marked.length > position.max_selection;

                return {
                    ...position,
                    marked: marked.length,
                    overvoted,
                    recorded: overvoted ? 0 : marked.length
                };
            }
        );

        if (positions.some(position => position.overvoted)) {
            return res.status(422).json({
                message:
                    "Overvote detected. No votes recorded. " +
                    "Review the ballot manually.",
                positions
            });
        }

        // =====================================
        // SAVE BALLOT AND VOTES ATOMICALLY
        // =====================================
        await db.beginTransaction();
        transactionStarted = true;

        const ballotId = crypto.randomUUID();
        const scannerUserId = req.user?.id ?? null;

        await db.execute(
            `INSERT INTO scanned_ballots
             (
                ballot_id,
                election_id,
                scanner_user_id,
                ballot_image_path
             )
             VALUES (?, ?, ?, ?)`,
            [
                ballotId,
                electionId,
                scannerUserId,
                req.file.path
            ]
        );

        let votesRecorded = 0;

        for (const position of positions) {
            for (
                const candidate of position.candidates.filter(
                    candidate => candidate.filled
                )
            ) {
                await db.execute(
                    `INSERT INTO ballot_votes
                     (
                        ballot_id,
                        candidate_id,
                        position_id,
                        fill_intensity
                     )
                     VALUES (?, ?, ?, ?)`,
                    [
                        ballotId,
                        candidate.candidate_id,
                        position.position_id,
                        candidate.fill_intensity
                    ]
                );

                votesRecorded++;
            }
        }

        await db.commit();
        transactionStarted = false;

        return res.status(201).json({
            message: "Ballot recorded successfully",
            ballot_id: ballotId,
            votes_recorded: votesRecorded,
            positions
        });

    } catch (error) {
        if (transactionStarted && db) {
            try {
                await db.rollback();
            } catch (rollbackError) {
                console.error(
                    "OMR rollback failed:",
                    rollbackError
                );
            }
        }

        console.error("OMR processing error:", error);

        return res.status(500).json({
            message:
                "Scan failed. Check server logs and database " +
                "records before retrying."
        });

    } finally {
        if (db) {
            db.release();
        }
    }
};

// =====================================
// LIVE TALLIES
// =====================================
exports.getLiveTallies = async (req, res) => {
    try {
        const electionId = Number(
            req.params.election_id
        );

        if (!validId(electionId)) {
            return res.status(400).json({
                message: "Invalid election ID"
            });
        }

        const [rows] = await pool.execute(
            `SELECT *
             FROM v_live_tallies
             WHERE election_id = ?
             ORDER BY position_id, total_votes DESC`,
            [electionId]
        );

        return res.status(200).json({
            tallies: rows
        });

    } catch (error) {
        console.error("Live tallies error:", error);

        return res.status(500).json({
            message: "Failed to load live tallies"
        });
    }
};
