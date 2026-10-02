const connection = require("../../../config/db"); // mysql2 pool with .promise()

// Create a new ballot template for an election
exports.createTemplate = async (req, res) => {
    try {
        const { election_id, template_name, paper_size } = req.body;

        if (!election_id || !template_name) {
            return res.status(400).json({ message: "election_id and template_name are required" });
        }

        const [electionRows] = await connection.execute(
            "SELECT election_id FROM elections WHERE election_id = ? LIMIT 1",
            [election_id],
        );
        if (electionRows.length === 0) {
            return res.status(404).json({ message: "Election not found" });
        }

        const [result] = await connection.execute(
            "INSERT INTO ballot_templates (election_id, template_name, paper_size) VALUES (?, ?, ?)",
            [election_id, template_name, paper_size || "A4"],
        );

        return res.status(201).json({
            message: "Ballot template created",
            template: { template_id: result.insertId, election_id, template_name, paper_size: paper_size || "A4" },
        });
    } catch (error) {
        console.error("Create template error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Define where a candidate's bubble sits on the printed ballot (pixel box, in the
// same coordinate space the physical ballots will be scanned/aligned to)
exports.addGridCoordinate = async (req, res) => {
    try {
        const { template_id } = req.params;
        const { candidate_id, bubble_code, x_pos, y_pos, width, height } = req.body;

        if (!candidate_id || !bubble_code || x_pos == null || y_pos == null || !width || !height) {
            return res.status(400).json({ message: "candidate_id, bubble_code, x_pos, y_pos, width and height are required" });
        }

        const [templateRows] = await connection.execute(
            "SELECT template_id FROM ballot_templates WHERE template_id = ? LIMIT 1",
            [template_id],
        );
        if (templateRows.length === 0) {
            return res.status(404).json({ message: "Ballot template not found" });
        }

        const [candidateRows] = await connection.execute(
            "SELECT candidate_id FROM candidates WHERE candidate_id = ? LIMIT 1",
            [candidate_id],
        );
        if (candidateRows.length === 0) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const [result] = await connection.execute(
            "INSERT INTO omr_grid_coordinates (template_id, candidate_id, bubble_code, x_pos, y_pos, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [template_id, candidate_id, bubble_code, x_pos, y_pos, width, height],
        );

        return res.status(201).json({
            message: "Bubble coordinate added",
            coordinate: { coord_id: result.insertId, template_id, candidate_id, bubble_code, x_pos, y_pos, width, height },
        });
    } catch (error) {
        console.error("Add grid coordinate error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Full layout for a template — used to render/print the ballot, and by the OMR
// reader to know exactly which pixel box to sample for each candidate
exports.getTemplate = async (req, res) => {
    try {
        const { template_id } = req.params;

        const [templateRows] = await connection.execute(
            "SELECT * FROM ballot_templates WHERE template_id = ? LIMIT 1",
            [template_id],
        );
        if (templateRows.length === 0) {
            return res.status(404).json({ message: "Ballot template not found" });
        }

        const [coordinates] = await connection.execute(
            `SELECT g.coord_id, g.candidate_id, g.bubble_code, g.x_pos, g.y_pos, g.width, g.height,
                    c.name AS candidate_name, c.position_id
             FROM omr_grid_coordinates g
             JOIN candidates c ON c.candidate_id = g.candidate_id
             WHERE g.template_id = ?
             ORDER BY c.position_id, g.bubble_code`,
            [template_id],
        );

        return res.status(200).json({ template: templateRows[0], coordinates });
    } catch (error) {
        console.error("Get template error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// List templates belonging to an election
exports.getTemplatesByElection = async (req, res) => {
    try {
        const { election_id } = req.params;
        const [rows] = await connection.execute(
            "SELECT * FROM ballot_templates WHERE election_id = ?",
            [election_id],
        );
        return res.status(200).json({ templates: rows });
    } catch (error) {
        console.error("List templates error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};