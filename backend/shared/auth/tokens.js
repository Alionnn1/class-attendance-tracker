const crypto = require('node:crypto');

const { getSql } = require('../db');

const DEFAULT_TTL_HOURS = 8;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function tokenLifetimeMs() {
  const hours = Number(process.env.TOKEN_TTL_HOURS);
  const validHours = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS;
  return validHours * 60 * 60 * 1000;
}

async function createToken(user) {
  const sql = getSql();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + tokenLifetimeMs()).toISOString();

  await sql`DELETE FROM auth_tokens WHERE user_id = ${user.id} AND expires_at <= now()`;
  await sql`
    INSERT INTO auth_tokens (token_hash, user_id, role, expires_at)
    VALUES (${hashToken(token)}, ${user.id}, ${user.role}, ${expiresAt})`;

  return { token, expiresAt };
}

async function findTokenUser(token) {
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, t.role
    FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${hashToken(token)} AND t.expires_at > now()`;

  if (rows.length === 0) return null;
  const row = rows[0];
  return { id: row.id, fullName: row.full_name, email: row.email, role: row.role };
}

async function deleteToken(token) {
  const sql = getSql();
  await sql`DELETE FROM auth_tokens WHERE token_hash = ${hashToken(token)}`;
}

module.exports = { createToken, findTokenUser, deleteToken };
