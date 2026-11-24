const express = require('express');
const cors = require('cors');

const {
  requestLogger,
  securityHeaders,
  corsOptions,
  notFound,
  errorHandler
} = require('./shared/http');
const authRoutes = require('./shared/auth/routes');
const studentServiceRoutes = require('./routes');

const SERVICE_NAME = 'student-service';

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

app.use('/auth', authRoutes);

app.use(studentServiceRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
