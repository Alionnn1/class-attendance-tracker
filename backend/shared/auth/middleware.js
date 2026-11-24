const crypto = require('node:crypto');

const { sendError } = require('../http');
const { findTokenUser } = require('./tokens');

const BEARER_PATTERN = /^Bearer\s+([a-f0-9]{64})$/i;

function readBearerToken(req) {
  const match = BEARER_PATTERN.exec((req.get('authorization') || '').trim());
  return match ? match[1].toLowerCase() : null;
}

function requireAuth(...allowedRoles) {
  return async function checkAuth(req, res, next) {
    const token = readBearerToken(req);
    if (!token) {
      return sendError(res, 401, 'UNAUTHORIZED', 'A valid login token is required.');
    }

    const user = await findTokenUser(token);
    if (!user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'The login token is invalid or has expired.');
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Your role is not allowed to do this.');
    }

    req.user = user;
    req.token = token;
    next();
  };
}

function requireInternal(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY || '';
  if (expected.length < 16) {
    throw new Error('INTERNAL_API_KEY is not set (or shorter than 16 characters).');
  }

  const given = Buffer.from(req.get('x-internal-key') || '');
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    return sendError(res, 401, 'UNAUTHORIZED', 'This endpoint is only for other services.');
  }

  next();
}

module.exports = { requireAuth, requireInternal };
