const { callService } = require('../shared/services');

async function findOpenSession(code) {
  const { status, body } = await callService('SESSION_SERVICE_URL', 'GET',
    `/sessions/open?code=${encodeURIComponent(code)}`, { internal: true });

  if (status === 404 || status === 410) return { status, session: null };
  if (status !== 200) throw new Error(`Session service answered ${status}.`);
  return { status, session: body };
}

module.exports = { findOpenSession };
