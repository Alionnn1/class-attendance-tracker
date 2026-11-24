const { getSql } = require('../shared/db');

async function sentLevels(courseId) {
  const sql = getSql();
  const rows = await sql`SELECT student_id, level FROM warnings WHERE course_id = ${courseId}`;
  return new Set(rows.map((row) => `${row.student_id}:${row.level}`));
}

async function lastWarnings(courseId) {
  const sql = getSql();
  const rows = await sql`
    SELECT student_id, level, sent_at FROM warnings
    WHERE course_id = ${courseId}
    ORDER BY sent_at, id`;
  const last = new Map();
  for (const row of rows) {
    last.set(row.student_id, { level: row.level, sentAt: row.sent_at });
  }
  return last;
}

async function recordWarning(studentId, courseId, level, emailResult) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO warnings (student_id, course_id, level, email_result)
    VALUES (${studentId}, ${courseId}, ${level}, ${emailResult})
    ON CONFLICT (student_id, course_id, level) DO NOTHING
    RETURNING id, student_id, course_id, level, sent_at, email_result`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    courseId: row.course_id,
    level: row.level,
    sentAt: row.sent_at,
    emailResult: row.email_result
  };
}

module.exports = { sentLevels, lastWarnings, recordWarning };
