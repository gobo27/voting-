
const connection = require("../../../config/db");

// ================= HELPERS =================

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0;
}

function serverError(res, label, error) {
    console.error(label, error);

    return res.status(500).json({
        message: "Internal server error"
    });
}

// Resolve election by ID or "current"
async function resolveElection(value) {
    let rows;

    if (value === "current") {
        [rows] = await connection.execute(
            `SELECT *
             FROM elections
             WHERE is_current = 1
               AND archived_at IS NULL
             LIMIT 1`
        );
    } else {
        if (!validId(value)) return null;

        [rows] = await connection.execute(
            `SELECT *
             FROM elections
             WHERE election_id = ?
             LIMIT 1`,
            [Number(value)]
        );
    }

    return rows[0] || null;
}

// Run election changes inside a transaction
async function withCurrentElection(requestedId, callback) {
    const db = await connection.getConnection();
    let hasLock = false;

    try {
        const [[lock]] = await db.query(
            "SELECT GET_LOCK('campusvote_election_cycle', 10) AS acquired"
        );

        if (lock.acquired !== 1) {
            return {
                status: 503,
                body: {
                    message: "Election is busy. Try again."
                }
            };
        }

        hasLock = true;
        await db.beginTransaction();

        const [rows] = await db.execute(
            `SELECT *
             FROM elections
             WHERE is_current = 1
               AND archived_at IS NULL
             LIMIT 1
             FOR UPDATE`
        );

        const election = rows[0];

        if (!election) {
            await db.rollback();

            return {
                status: 409,
                body: {
                    message: "No current election available"
                }
            };
        }

        if (
            requestedId !== "current" &&
            Number(requestedId) !== election.election_id
        ) {
            await db.rollback();

            return {
                status: 409,
                body: {
                    message:
                        "This is not the current election. Refresh the page."
                }
            };
        }

        if (election.status === "completed") {
            await db.rollback();

            return {
                status: 409,
                body: {
                    message:
                        "This election is already completed"
                }
            };
        }

        const result = await callback(db, election);

        if (result.status >= 400) {
            await db.rollback();
        } else {
            await db.commit();
        }

        return result;

    } catch (error) {
        try {
            await db.rollback();
        } catch (_) {}

        throw error;

    } finally {
        if (hasLock) {
            try {
                await db.query(
                    "SELECT RELEASE_LOCK('campusvote_election_cycle')"
                );
            } catch (error) {
                console.error("Release lock error:", error);
            }
        }

        db.release();
    }
}

// ================= GET ELECTION STATUS =================

exports.getStatus = async (req, res) => {
    try {
        const election = await resolveElection(
            req.params.election_id
        );

        if (!election) {
            return res.status(404).json({
                message: "Election not found"
            });
        }

        return res.status(200).json({
            election: {
                election_id: election.election_id,
                title: election.title,
                start_time: election.start_time,
                end_time: election.end_time,
                status: election.status,
                is_active: election.is_active,
                mask_names: election.mask_names,
                is_current: election.is_current,
                archived_at: election.archived_at
            }
        });

    } catch (error) {
        return serverError(
            res,
            "Get election status error:",
            error
        );
    }
};

// ================= GET PUBLIC CANDIDATES =================

exports.getPublicCandidates = async (req, res) => {
    try {
        const election = await resolveElection(
            req.params.election_id
        );

        if (!election) {
            return res.status(404).json({
                message: "Election not found"
            });
        }

        const maskNames = Boolean(election.mask_names);

        const [rows] = await connection.execute(
            `SELECT
                c.candidate_id,
                c.name,
                c.course,
                c.grade_level,
                c.party_list,
                c.position_id,
                c.display_order,
                p.title AS position_title
             FROM candidates c
             JOIN positions p
               ON p.position_id = c.position_id
              AND p.election_id = c.election_id
             WHERE c.election_id = ?
             ORDER BY
                p.display_order,
                c.display_order,
                c.candidate_id`,
            [election.election_id]
        );

        const candidates = rows.map(candidate => ({
            ...candidate,
            name: maskNames
                ? `Candidate #${candidate.candidate_id}`
                : candidate.name
        }));

        return res.status(200).json({
            mask_names: maskNames,
            candidates
        });

    } catch (error) {
        return serverError(
            res,
            "Get public candidates error:",
            error
        );
    }
};

// ================= SET SCHEDULE =================

exports.setSchedule = async (req, res) => {
    const { start_time, end_time } = req.body || {};

    if (!start_time || !end_time) {
        return res.status(400).json({
            message: "Start time and end time are required"
        });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        start >= end
    ) {
        return res.status(400).json({
            message:
                "Start time must be before end time"
        });
    }

    try {
        const result = await withCurrentElection(
            req.params.election_id,
            async (db, election) => {

                if (election.status === "active") {
                    return {
                        status: 409,
                        body: {
                            message:
                                "Cannot change schedule while voting is active"
                        }
                    };
                }

                await db.execute(
                    `UPDATE elections
                     SET start_time = ?,
                         end_time = ?
                     WHERE election_id = ?`,
                    [
                        start_time,
                        end_time,
                        election.election_id
                    ]
                );

                return {
                    status: 200,
                    body: {
                        message: "Election schedule updated"
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return serverError(
            res,
            "Set schedule error:",
            error
        );
    }
};

// ================= START ELECTION =================

exports.startElection = async (req, res) => {
    try {
        const result = await withCurrentElection(
            req.params.election_id,
            async (db, election) => {

                if (election.status === "active") {
                    return {
                        status: 200,
                        body: {
                            message: "Election is already active"
                        }
                    };
                }

                await db.execute(
                    `UPDATE elections
                     SET status = 'active',
                         is_active = 1
                     WHERE election_id = ?
                       AND is_current = 1
                       AND archived_at IS NULL
                       AND (
                           status IS NULL
                           OR status <> 'completed'
                       )`,
                    [election.election_id]
                );

                return {
                    status: 200,
                    body: {
                        message: "Election started"
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return serverError(
            res,
            "Start election error:",
            error
        );
    }
};

// ================= STOP VOTING =================

exports.stopVoting = async (req, res) => {
    try {
        const result = await withCurrentElection(
            req.params.election_id,
            async (db, election) => {

                if (election.status !== "active") {
                    return {
                        status: 409,
                        body: {
                            message:
                                "Only an active election can be stopped"
                        }
                    };
                }

                await db.execute(
                    `UPDATE elections
                     SET status = 'completed',
                         is_active = 0
                     WHERE election_id = ?
                       AND is_current = 1
                       AND archived_at IS NULL
                       AND status = 'active'`,
                    [election.election_id]
                );

                return {
                    status: 200,
                    body: {
                        message: "Voting stopped permanently"
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return serverError(
            res,
            "Stop voting error:",
            error
        );
    }
};

// ================= MASK NAMES =================

exports.toggleMaskNames = async (req, res) => {
    try {
        const result = await withCurrentElection(
            req.params.election_id,
            async (db, election) => {

                const newValue = election.mask_names ? 0 : 1;

                await db.execute(
                    `UPDATE elections
                     SET mask_names = ?
                     WHERE election_id = ?
                       AND is_current = 1
                       AND archived_at IS NULL`,
                    [
                        newValue,
                        election.election_id
                    ]
                );

                return {
                    status: 200,
                    body: {
                        message: "Mask names updated",
                        mask_names: Boolean(newValue)
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return serverError(
            res,
            "Toggle mask names error:",
            error
        );
    }
};
