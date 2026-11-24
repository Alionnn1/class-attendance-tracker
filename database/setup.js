const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { getSql } = require('../backend/shared/db');
const { hashPassword } = require('../backend/shared/auth/passwords');
const { buildSeedData, EXAMPLE_PASSWORD } = require('./seed-data');

const TABLES_IN_DROP_ORDER = [
  'reports', 'warnings', 'excuse_requests', 'attendance_records',
  'sessions', 'course_members', 'courses', 'auth_tokens', 'users'
];

const TABLES_WITH_IDS = ['users', 'courses', 'sessions', 'attendance_records', 'excuse_requests', 'warnings', 'reports'];

function readStatements(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function insertRows(sql, table, columns, rows) {
  const ROWS_PER_QUERY = 400;
  for (let start = 0; start < rows.length; start += ROWS_PER_QUERY) {
    const values = [];
    const groups = rows.slice(start, start + ROWS_PER_QUERY).map((row) => {
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await sql.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${groups.join(', ')}`, values);
  }
}

async function seed(sql, seedPassword) {
  const data = buildSeedData();
  const password = seedPassword || EXAMPLE_PASSWORD;

  const userRows = [];
  for (const u of data.users) {
    userRows.push([u.id, u.fullName, u.email, await hashPassword(password), u.role]);
  }
  await insertRows(sql, 'users', ['id', 'full_name', 'email', 'password_hash', 'role'], userRows);

  await insertRows(sql, 'courses', ['id', 'code', 'name', 'first_warning_at', 'second_warning_at', 'absence_limit'],
    data.courses.map((c) => [c.id, c.code, c.name, c.firstWarningAt, c.secondWarningAt, c.absenceLimit]));

  await insertRows(sql, 'course_members', ['course_id', 'user_id', 'role_in_course'],
    data.members.map((m) => [m.courseId, m.userId, m.roleInCourse]));

  await insertRows(sql, 'sessions', ['id', 'course_id', 'code', 'opened_by', 'opened_at', 'expires_at', 'closed_at', 'status'],
    data.sessions.map((s) => [s.id, s.courseId, s.code, s.openedBy, s.openedAt, s.expiresAt, s.closedAt, s.status]));

  await insertRows(sql, 'attendance_records', ['id', 'session_id', 'student_id', 'course_id', 'status', 'checked_in_at'],
    data.attendance.map((r) => [r.id, r.sessionId, r.studentId, r.courseId, r.status, r.checkedInAt]));

  await insertRows(sql, 'excuse_requests', ['id', 'attendance_record_id', 'student_id', 'reason', 'status', 'reviewed_by', 'reviewed_at', 'created_at'],
    data.excuses.map((e) => [e.id, e.attendanceRecordId, e.studentId, e.reason, e.status, e.reviewedBy, e.reviewedAt, e.createdAt]));

  await insertRows(sql, 'warnings', ['id', 'student_id', 'course_id', 'level', 'sent_at', 'email_result'],
    data.warnings.map((w) => [w.id, w.studentId, w.courseId, w.level, w.sentAt, w.emailResult]));

  for (const table of TABLES_WITH_IDS) {
    await sql.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT max(id) FROM ${table}), 0) + 1, false)`);
  }

  console.log(`Example data added: ${data.users.length} users, ${data.courses.length} courses, `
    + `${data.sessions.length} sessions, ${data.attendance.length} attendance records, `
    + `${data.excuses.length} excuses, ${data.warnings.length} warning emails`);
}

async function setupDatabase(sql, { reset = false, seedPassword = '' } = {}) {
  if (reset) {
    for (const table of TABLES_IN_DROP_ORDER) {
      await sql.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    console.log(`Dropped ${TABLES_IN_DROP_ORDER.length} tables`);
  }

  const statements = readStatements(path.join(__dirname, 'schema.sql'));
  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`Tables ready (${statements.length} statements)`);

  const [{ count }] = await sql.query('SELECT count(*)::int AS count FROM users');
  if (count > 0) {
    console.log('The database already has data, so the example data was not added. Use npm run db:reset to start over.');
    return;
  }
  await seed(sql, seedPassword);
}

async function main() {
  const reset = process.argv.includes('--reset');
  const seedPassword = (process.env.SEED_PASSWORD || '').trim();
  await setupDatabase(getSql(), { reset, seedPassword });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { setupDatabase };
