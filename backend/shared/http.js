function sendError(res, status, code, message, field) {
  const error = field ? { code, message, field } : { code, message };
  return res.status(status).json({ error });
}

function requestLogger(serviceName) {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      console.log(`${new Date().toISOString()} ${serviceName} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  });
  next();
}

function corsOptions() {
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: origins,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  };
}

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  next();
}

function notFound(req, res) {
  return sendError(res, 404, 'ROUTE_NOT_FOUND', 'Route not found.');
}

function errorHandler(error, req, res, next) {
  if (error.type === 'entity.parse.failed') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON.');
  }
  if (error.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }

  console.error(error);
  return sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
}

module.exports = {
  sendError,
  requestLogger,
  securityHeaders,
  corsOptions,
  requireJson,
  notFound,
  errorHandler
};
