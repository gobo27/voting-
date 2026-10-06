const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i);
  const token = bearer ? bearer[1] : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: "No token provided." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("JWT verify failed:", err.name, err.message);
      return res.status(403).json({ message: "Invalid or expired token." });
    }
    req.user = decoded;
    next();
  });
}

// Reusable role gate - use after verifyToken
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to access this resource." });
    }
    next();
  };
}

module.exports = verifyToken;
module.exports.isAdmin = requireRole("super_admin");
module.exports.isCommittee = requireRole("committee");
module.exports.isAdviser = requireRole("adviser");
module.exports.requireRole = requireRole; // for any future role, e.g. requireRole("committee")