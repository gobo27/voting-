
const connection = require("../../../config/db");

// ================= HELPERS =================

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0;
}

function validPaperSize(value) {
    return ["A4", "A5"].includes(value);
}

function errorResponse(res, label, error) {
    console.error(label, error);
    return res.status(500).json({
        message: "Internal server error"
    });
}

function validateCoordinates(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates.length) {
        return "At least one OMR coordinate is required";
    }

    const candidates = new Set();
    const codes = new Set();

    for (const item of coordinates) {
        if (
            !item ||
            !validId(item.candidate_id) ||
            typeof item.bubble_code !== "string" ||
            !item.bubble_code.trim() ||
            !Number.isInteger(item.x_pos) ||
            !Number.isInteger(item.y_pos) ||
            !Number.isInteger(item.width) ||
            !Number.isInteger(item.height) ||
            item.x_pos < 0 ||
            item.y_pos < 0 ||
            item.width <= 0 ||
            item.height <= 0
        ) {
            return "Invalid OMR coordinate data";
        }

        const candidateId = Number(item.candidate_id);
        const code = item.bubble_code.trim();

        if (candidates.has(candidateId) || codes.has(code)) {
            return "Duplicate candidate or bubble code";
        }

        candidates.add(candidateId);
        codes.add(code);
    }

    return null;
}

// All ballot write operations use the same election lock.
// This also coordinates with the archive operation when
// the archive controller uses the same named lock.
async function withCurrentElection(callback) {
    const db = await connection.getConnection();
    let locked = false;
    let transactionStarted = false;

    try {
        const [[lockResult]] = await db.query(
            "SELECT GET_LOCK('campusvote_election_cycle', 10) AS acquired"
        );

        if (lockResult.acquired !== 1) {
            return {
                status: 503,
                body: {
                    message: "Election is busy. Please try again."
                }
            };
        }

        locked = true;
        await db.beginTransaction();
        transactionStarted = true;

        const [rows] = await db.execute(
            `SELECT election_id, status, is_current, archived_at
             FROM elections
             WHERE is_current = 1
               AND archived_at IS NULL
             LIMIT 1
             FOR UPDATE`
        );

        const election = rows[0];

        if (!election) {
            await db.rollback();
            transactionStarted = false;
            return {
                status: 409,
                body: {
                    message: "No current election available"
                }
            };
        }

        if (election.status === "completed") {
            await db.rollback();
            transactionStarted = false;
            return {
                status: 409,
                body: {
                    message:
                        "Cannot modify ballots in a completed election"
                }
            };
        }

        const result = await callback(db, election);

        if (result.status >= 400) {
            await db.rollback();
        } else {
            await db.commit();
        }

        transactionStarted = false;
        return result;

    } catch (error) {
        if (transactionStarted) {
            try {
                await db.rollback();
            } catch (_) {}
        }
        throw error;

    } finally {
        if (locked) {
            try {
                await db.query(
                    "SELECT RELEASE_LOCK('campusvote_election_cycle')"
                );
            } catch (error) {
                console.error("Release election lock error:", error);
            }
        }
        db.release();
    }
}

function matchesCurrent(requestedId, election) {
    return (
        requestedId === "current" ||
        (
            validId(requestedId) &&
            Number(requestedId) === election.election_id
        )
    );
}

async function candidatesBelongToElection(
    db,
    candidateIds,
    electionId
) {
    if (!candidateIds.length) return false;

    const placeholders = candidateIds.map(() => "?").join(",");

    const [rows] = await db.execute(
        `SELECT c.candidate_id
         FROM candidates c
         INNER JOIN positions p
           ON p.position_id = c.position_id
          AND p.election_id = c.election_id
         WHERE c.election_id = ?
           AND c.candidate_id IN (${placeholders})`,
        [electionId, ...candidateIds]
    );

    return rows.length === candidateIds.length;
}

// ================= CREATE TEMPLATE =================

exports.createTemplate = async (req, res) => {
    const {
        election_id,
        template_name,
        paper_size = "A4"
    } = req.body || {};

    if (
        !validId(election_id) &&
        election_id !== "current"
    ) {
        return res.status(400).json({
            message: "Valid election_id is required"
        });
    }

    if (
        typeof template_name !== "string" ||
        !template_name.trim() ||
        !validPaperSize(paper_size)
    ) {
        return res.status(400).json({
            message: "Valid template_name and paper_size are required"
        });
    }

    try {
        const result = await withCurrentElection(
            async (db, election) => {
                if (!matchesCurrent(election_id, election)) {
                    return {
                        status: 409,
                        body: {
                            message:
                                "Cannot create a ballot for an old election. Refresh the page."
                        }
                    };
                }

                const [insert] = await db.execute(
                    `INSERT INTO ballot_templates
                     (election_id, template_name, paper_size)
                     VALUES (?, ?, ?)`,
                    [
                        election.election_id,
                        template_name.trim(),
                        paper_size
                    ]
                );

                return {
                    status: 201,
                    body: {
                        message: "Ballot template created",
                        template: {
                            template_id: insert.insertId,
                            election_id: election.election_id,
                            template_name: template_name.trim(),
                            paper_size
                        }
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return errorResponse(
            res,
            "Create template error:",
            error
        );
    }
};

// ================= CREATE COMPLETE OMR TEMPLATE =================

exports.createCompleteTemplate = async (req, res) => {
    const {
        election_id,
        template_name,
        paper_size = "A5",
        coordinates
    } = req.body || {};

    if (
        (!validId(election_id) && election_id !== "current") ||
        typeof template_name !== "string" ||
        !template_name.trim() ||
        !validPaperSize(paper_size)
    ) {
        return res.status(400).json({
            message: "Invalid election, template name or paper size"
        });
    }

    const validationError = validateCoordinates(coordinates);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    try {
        const result = await withCurrentElection(
            async (db, election) => {
                if (!matchesCurrent(election_id, election)) {
                    return {
                        status: 409,
                        body: {
                            message:
                                "Cannot create a ballot for an old election. Refresh the page."
                        }
                    };
                }

                const candidateIds = coordinates.map(
                    item => Number(item.candidate_id)
                );

                const validCandidates =
                    await candidatesBelongToElection(
                        db,
                        candidateIds,
                        election.election_id
                    );

                if (!validCandidates) {
                    return {
                        status: 400,
                        body: {
                            message:
                                "Some candidates do not belong to the current election"
                        }
                    };
                }

                const [insert] = await db.execute(
                    `INSERT INTO ballot_templates
                     (election_id, template_name, paper_size)
                     VALUES (?, ?, ?)`,
                    [
                        election.election_id,
                        template_name.trim(),
                        paper_size
                    ]
                );

                const templateId = insert.insertId;

                for (const item of coordinates) {
                    await db.execute(
                        `INSERT INTO omr_grid_coordinates
                         (
                            template_id,
                            candidate_id,
                            bubble_code,
                            x_pos,
                            y_pos,
                            width,
                            height
                         )
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            templateId,
                            Number(item.candidate_id),
                            item.bubble_code.trim(),
                            item.x_pos,
                            item.y_pos,
                            item.width,
                            item.height
                        ]
                    );
                }

                return {
                    status: 201,
                    body: {
                        message:
                            "Complete OMR ballot saved successfully",
                        template: {
                            template_id: templateId,
                            election_id: election.election_id,
                            template_name: template_name.trim(),
                            paper_size
                        },
                        coordinates_saved: coordinates.length
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return errorResponse(
            res,
            "Save complete ballot error:",
            error
        );
    }
};

// ================= ADD SINGLE OMR COORDINATE =================

exports.addGridCoordinate = async (req, res) => {
    const { template_id } = req.params;

    const {
        candidate_id,
        bubble_code,
        x_pos,
        y_pos,
        width,
        height
    } = req.body || {};

    if (
        !validId(template_id) ||
        !validId(candidate_id) ||
        typeof bubble_code !== "string" ||
        !bubble_code.trim() ||
        ![x_pos, y_pos, width, height].every(Number.isInteger) ||
        x_pos < 0 ||
        y_pos < 0 ||
        width <= 0 ||
        height <= 0
    ) {
        return res.status(400).json({
            message: "Invalid coordinate information"
        });
    }

    try {
        const result = await withCurrentElection(
            async (db, election) => {
                const [templates] = await db.execute(
                    `SELECT template_id, election_id
                     FROM ballot_templates
                     WHERE template_id = ?
                     LIMIT 1`,
                    [Number(template_id)]
                );

                if (!templates.length) {
                    return {
                        status: 404,
                        body: {
                            message: "Template not found"
                        }
                    };
                }

                if (
                    templates[0].election_id !==
                    election.election_id
                ) {
                    return {
                        status: 403,
                        body: {
                            message:
                                "Cannot modify a ballot from an old election"
                        }
                    };
                }

                const validCandidates =
                    await candidatesBelongToElection(
                        db,
                        [Number(candidate_id)],
                        election.election_id
                    );

                if (!validCandidates) {
                    return {
                        status: 400,
                        body: {
                            message:
                                "Candidate does not belong to the template election"
                        }
                    };
                }

                const [duplicates] = await db.execute(
                    `SELECT coord_id
                     FROM omr_grid_coordinates
                     WHERE template_id = ?
                       AND (
                           candidate_id = ?
                           OR bubble_code = ?
                       )
                     LIMIT 1`,
                    [
                        Number(template_id),
                        Number(candidate_id),
                        bubble_code.trim()
                    ]
                );

                if (duplicates.length) {
                    return {
                        status: 409,
                        body: {
                            message:
                                "Candidate or bubble code already exists in this template"
                        }
                    };
                }

                const [insert] = await db.execute(
                    `INSERT INTO omr_grid_coordinates
                     (
                        template_id,
                        candidate_id,
                        bubble_code,
                        x_pos,
                        y_pos,
                        width,
                        height
                     )
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        Number(template_id),
                        Number(candidate_id),
                        bubble_code.trim(),
                        x_pos,
                        y_pos,
                        width,
                        height
                    ]
                );

                return {
                    status: 201,
                    body: {
                        message: "OMR coordinate added",
                        coordinate: {
                            coord_id: insert.insertId,
                            template_id: Number(template_id),
                            candidate_id: Number(candidate_id),
                            bubble_code: bubble_code.trim(),
                            x_pos,
                            y_pos,
                            width,
                            height
                        }
                    }
                };
            }
        );

        return res.status(result.status).json(result.body);

    } catch (error) {
        return errorResponse(
            res,
            "Add coordinate error:",
            error
        );
    }
};

// ================= GET ONE TEMPLATE =================

// Historical templates remain readable.
exports.getTemplate = async (req, res) => {
    const { template_id } = req.params;

    if (!validId(template_id)) {
        return res.status(400).json({
            message: "Invalid template ID"
        });
    }

    try {
        const [templates] = await connection.execute(
            `SELECT *
             FROM ballot_templates
             WHERE template_id = ?
             LIMIT 1`,
            [Number(template_id)]
        );

        if (!templates.length) {
            return res.status(404).json({
                message: "Template not found"
            });
        }

        const electionId = templates[0].election_id;

        const [coordinates] = await connection.execute(
            `SELECT
                g.coord_id,
                g.template_id,
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
             INNER JOIN candidates c
                ON c.candidate_id = g.candidate_id
             INNER JOIN positions p
                ON p.position_id = c.position_id
               AND p.election_id = c.election_id
             WHERE g.template_id = ?
               AND c.election_id = ?
             ORDER BY g.y_pos, g.x_pos`,
            [
                Number(template_id),
                electionId
            ]
        );

        return res.status(200).json({
            template: templates[0],
            coordinates
        });

    } catch (error) {
        return errorResponse(
            res,
            "Get template error:",
            error
        );
    }
};

// ================= GET TEMPLATES BY ELECTION =================

// Supports a numeric election ID or "current".
exports.getTemplatesByElection = async (req, res) => {
    const { election_id } = req.params;

    try {
        let electionId;

        if (election_id === "current") {
            const [rows] = await connection.execute(
                `SELECT election_id
                 FROM elections
                 WHERE is_current = 1
                   AND archived_at IS NULL
                 LIMIT 1`
            );

            if (!rows.length) {
                return res.status(200).json({
                    templates: []
                });
            }

            electionId = rows[0].election_id;

        } else {
            if (!validId(election_id)) {
                return res.status(400).json({
                    message: "Invalid election ID"
                });
            }

            electionId = Number(election_id);
        }

        const [templates] = await connection.execute(
            `SELECT *
             FROM ballot_templates
             WHERE election_id = ?
             ORDER BY template_id DESC`,
            [electionId]
        );

        return res.status(200).json({
            templates
        });

    } catch (error) {
        return errorResponse(
            res,
            "Get templates error:",
            error
        );
    }
};
