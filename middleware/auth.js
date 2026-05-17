const jwt = require('jsonwebtoken');

module.exports = function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  // EventSource (SSE) nu suportă headers — tokenul vine ca query param ?token=
  const raw = header
    ? (header.startsWith('Bearer ') ? header.slice(7) : header)
    : req.query.token;

  if (!raw) return res.status(401).json({ error: 'Token lipsă' });

  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid sau expirat' });
  }
};
