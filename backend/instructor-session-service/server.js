const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const app = require('./app');

const PORT = Number(process.env.PORT) || 3002;

app.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`instructor-session-service listening on http://localhost:${PORT} (${env})`);
});
