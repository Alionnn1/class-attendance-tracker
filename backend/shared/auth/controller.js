const { getSql } = require('../db');
const { sendError } = require('../http');
const { checkEmail, normalizeEmail } = require('../validate');
const { verifyPassword, DUMMY_HASH } = require('./passwords');
const { createToken, deleteToken } = require('./tokens');

function validateLogin(email, password) {
  const emailProblem = checkEmail(email);
  if (emailProblem) return emailProblem;
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.';
  }
  if (password.length > 128) {
    return 'Password must contain at most 128 characters.';
  }
  return null;
}

async function login(req, res) {
  const { email, password } = req.body ?? {};

  const problem = validateLogin(email, password);
  if (problem) {
    return sendError(res, 400, 'VALIDATION_ERROR', problem);
  }

  const sql = getSql();
  const rows = await sql`
    SELECT id, full_name, email, role, password_hash
    FROM users
    WHERE email = ${normalizeEmail(email)}`;
  const user = rows[0];

  const passwordMatches = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordMatches) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const { token, expiresAt } = await createToken(user);

  return res.status(200).json({
    token,
    role: user.role,
    expiresAt,
    user: { id: user.id, fullName: user.full_name, email: user.email }
  });
}

async function logout(req, res) {
  await deleteToken(req.token);
  return res.status(204).end();
}

module.exports = { login, logout };
