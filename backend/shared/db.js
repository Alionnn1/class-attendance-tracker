const { neon } = require('@neondatabase/serverless');

let sql = null;

function getSql() {
  if (sql) return sql;

  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Add it to .env locally, or to the Lambda environment variables.');
  }

  sql = neon(databaseUrl);
  return sql;
}

module.exports = { getSql };
