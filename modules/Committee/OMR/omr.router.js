const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const omrController = require("./omr.controller");
const verifyToken = require("../../sheared/middleware");

// Uploaded ballot scans land here — adjust the path if your project structure differs
const uploadDir = path.join(__dirname, "../../uploads/ballots");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only JPEG, PNG or WEBP images are allowed"));
        }
        cb(null, true);
    },
});

// Public: the live dashboard polls this — no login needed
router.get("/tallies/:election_id", omrController.getLiveTallies);

// Protected: only committee/super_admin can scan and count ballots
router.use(verifyToken, verifyToken.requireRole("super_admin", "committee"));

router.post("/scan", upload.single("ballot_image"), omrController.uploadAndProcess);

module.exports = router;