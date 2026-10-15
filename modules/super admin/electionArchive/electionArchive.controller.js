
const db = require("../../../config/db");

const fail = (res, error) => {
    console.error("Election archive:", error);

    return res.status(500).json({
        message: "Database operation failed"
    });
};

// ================= ELECTION HISTORY =================

exports.list = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                e.election_id,
                e.title,
                e.start_time,
                e.end_time,
                e.status,
                e.is_active,
                e.is_current,
                e.archived_at,

                (
                    SELECT COUNT(*)
                    FROM positions p
                    WHERE p.election_id = e.election_id
                ) AS positions_count,

                (
                    SELECT COUNT(*)
                    FROM candidates c
                    WHERE c.election_id = e.election_id
                ) AS candidates_count,

                (
                    SELECT COUNT(*)
                    FROM scanned_ballots b
                    WHERE b.election_id = e.election_id
                ) AS scanned_ballots_count

            FROM elections e
            ORDER BY e.election_id DESC
        `);

        return res.status(200).json({
            elections: rows
        });

    } catch (error) {
        return fail(res, error);
    }
};

// ================= SAFE TRANSACTION =================

async function lockedTransaction(callback) {
    const conn = await db.getConnection();
    let locked = false;

    try {
        const [[result]] = await conn.query(
            "SELECT GET_LOCK('campusvote_election_cycle', 10) AS acquired"
        );

        if (result.acquired !== 1) {
            throw new Error(
                "Election management is busy. Please retry."
            );
        }

        locked = true;

        await conn.beginTransaction();

        const output = await callback(conn);

        await conn.commit();

        return output;

    } catch (error) {
        try {
            await conn.rollback();
        } catch (_) {}

        throw error;

    } finally {
        if (locked) {
            try {
                await conn.query(
                    "SELECT RELEASE_LOCK('campusvote_election_cycle')"
                );
            } catch (_) {}
        }

        conn.release();
    }
}

// ================= ARCHIVE ELECTION =================

exports.archive = async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Invalid election ID"
        });
    }

    try {
        const result = await lockedTransaction(async conn => {

            const [rows] = await conn.execute(
                `SELECT election_id, status, archived_at
                 FROM elections
                 WHERE election_id = ?
                 FOR UPDATE`,
                [id]
            );

            if (!rows.length) {
                return {
                    code: 404,
                    message: "Election not found"
                };
            }

            if (rows[0].archived_at) {
                return {
                    code: 409,
                    message: "Election already archived"
                };
            }

            if (rows[0].status !== "completed") {
                return {
                    code: 409,
                    message: "Stop voting before archiving this election"
                };
            }

            await conn.execute(
                `UPDATE elections
                 SET archived_at = NOW(),
                     is_current = 0,
                     is_active = 0
                 WHERE election_id = ?`,
                [id]
            );

            return {
                code: 200,
                message: "Election archived; historical data preserved"
            };
        });

        return res.status(result.code).json({
            message: result.message
        });

    } catch (error) {
        return fail(res, error);
    }
};

// ================= CREATE NEW ELECTION =================

exports.create = async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const start = String(req.body?.start_time || "");
    const end = String(req.body?.end_time || "");

    const copyId = req.body?.copy_positions_from
        ? Number(req.body.copy_positions_from)
        : null;

    if (!title || title.length > 150) {
        return res.status(400).json({
            message: "Title is required (max 150 characters)"
        });
    }

    const dateFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    if (
        !dateFormat.test(start) ||
        !dateFormat.test(end) ||
        start >= end
    ) {
        return res.status(400).json({
            message:
                "Provide valid start_time and end_time " +
                "in YYYY-MM-DD HH:mm:ss, with start before end"
        });
    }

    if (
        copyId !== null &&
        (!Number.isSafeInteger(copyId) || copyId <= 0)
    ) {
        return res.status(400).json({
            message: "Invalid source election ID"
        });
    }

    try {
        const result = await lockedTransaction(async conn => {

            const [current] = await conn.query(
                `SELECT election_id
                 FROM elections
                 WHERE is_current = 1
                 LIMIT 1
                 FOR UPDATE`
            );

            if (current.length) {
                return {
                    code: 409,
                    message:
                        "Archive the current completed election " +
                        "before creating a new one"
                };
            }

            if (copyId !== null) {
                const [source] = await conn.execute(
                    `SELECT election_id
                     FROM elections
                     WHERE election_id = ?`,
                    [copyId]
                );

                if (!source.length) {
                    return {
                        code: 404,
                        message: "Source election not found"
                    };
                }
            }

            const [insert] = await conn.execute(
                `INSERT INTO elections
                 (
                     title,
                     start_time,
                     end_time,
                     status,
                     is_active,
                     mask_names,
                     is_current
                 )
                 VALUES (?, ?, ?, NULL, 0, 0, 1)`,
                [title, start, end]
            );

            if (copyId !== null) {
                await conn.execute(
                    `INSERT INTO positions
                     (
                         election_id,
                         title,
                         max_selection,
                         display_order
                     )
                     SELECT
                         ?,
                         title,
                         max_selection,
                         display_order
                     FROM positions
                     WHERE election_id = ?`,
                    [insert.insertId, copyId]
                );
            }

            return {
                code: 201,
                message: "New election created",
                election_id: insert.insertId
            };
        });

        return res.status(result.code).json(result);

    } catch (error) {
        return fail(res, error);
    }
};
