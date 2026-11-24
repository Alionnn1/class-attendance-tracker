const express = require('express');
const cors = require('cors');

const {
  requestLogger,
  securityHeaders,
  corsOptions,
  notFound,
  errorHandler
} = require('./shared/http');
const serviceRoutes = require('./routes');

const SERVICE_NAME = 'course-reports-service';

const app = express();

app.disable('x-powered-by');
app.use(requestLogger(SERVICE_NAME));
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    runtime: process.env.AWS_LAMBDA_FUNCTION_NAME ? 'lambda' : 'pc'
  });
});

app.use(serviceRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
