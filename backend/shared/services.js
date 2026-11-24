const TIMEOUT_MS = 8000;

async function callService(urlVariable, method, path, { body, internal = false, token } = {}) {
  const baseUrl = (process.env[urlVariable] || '').trim();
  if (!baseUrl) throw new Error(`${urlVariable} is not set.`);

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (internal) headers['X-Internal-Key'] = process.env.INTERNAL_API_KEY || '';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
  }
  return { status: response.status, body: data };
}

module.exports = { callService };
