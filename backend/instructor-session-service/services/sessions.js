const crypto = require('node:crypto');

const { getSql } = require('../shared/db');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function toSession(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    code: row.code,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    status: row.status
  };
}

async function findSession(id) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM sessions WHERE id = ${id}`;
  return rows[0] ? toSession(rows[0]) : null;
}

async function findOpenSessionOfCourse(courseId) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM sessions WHERE course_id = ${courseId} AND status = 'open'`;
  return rows[0] ? toSession(rows[0]) : null;
}

async function findSessionByCode(code) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM sessions WHERE code = ${code} ORDER BY opened_at DESC LIMIT 1`;
  return rows[0] ? toSession(rows[0]) : null;
}

async function unusedCode() {
  const sql = getSql();
  let code = randomCode();
  let inUse = await sql`SELECT id FROM sessions WHERE code = ${code} AND status = 'open'`;
  while (inUse.length > 0) {
    code = randomCode();
    inUse = await sql`SELECT id FROM sessions WHERE code = ${code} AND status = 'open'`;
  }
  return code;
}

async function openSession(courseId, instructorId, durationMinutes) {
  const sql = getSql();
  const openedAt = new Date();
  const expiresAt = new Date(openedAt.getTime() + durationMinutes * 60 * 1000);
  const rows = await sql`
    INSERT INTO sessions (course_id, code, opened_by, opened_at, expires_at)
    VALUES (${courseId}, ${await unusedCode()}, ${instructorId}, ${openedAt.toISOString()}, ${expiresAt.toISOString()})
    RETURNING *`;
  return toSession(rows[0]);
}

async function closeSession(id) {
  const sql = getSql();
  const rows = await sql`
    UPDATE sessions SET status = 'closed', closed_at = now()
    WHERE id = ${id} AND status = 'open'
    RETURNING *`;
  return rows[0] ? toSession(rows[0]) : null;
}

async function reopenSession(id) {
  const sql = getSql();
  await sql`UPDATE sessions SET status = 'open', closed_at = NULL WHERE id = ${id}`;
}

async function checkInsOfSession(sessionId, courseId) {
  const sql = getSql();
  const checkedIn = await sql`
    SELECT a.student_id, u.full_name, a.checked_in_at
    FROM attendance_records a
    JOIN users u ON u.id = a.student_id
    WHERE a.session_id = ${sessionId} AND a.status = 'present'
    ORDER BY a.checked_in_at DESC`;
  const enrolled = await sql`
    SELECT count(*)::int AS n FROM course_members
    WHERE course_id = ${courseId} AND role_in_course = 'student'`;

  return {
    enrolledCount: enrolled[0].n,
    checkedIn: checkedIn.map((row) => ({
      studentId: row.student_id,
      studentName: row.full_name,
      checkedInAt: row.checked_in_at
    }))
  };
}

async function countsOfSession(sessionId) {
  const sql = getSql();
  const rows = await sql`
    SELECT SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END)::int AS present,
           SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END)::int AS absent
    FROM attendance_records
    WHERE session_id = ${sessionId}`;
  return rows[0];
}

async function coursesOfInstructor(instructorId) {
  const sql = getSql();
  return sql`
    SELECT c.id, c.code, c.name, c.first_warning_at, c.second_warning_at, c.absence_limit,
           (SELECT count(*)::int
              FROM excuse_requests e
              JOIN attendance_records a ON a.id = e.attendance_record_id
              WHERE a.course_id = c.id AND e.status = 'pending') AS pending_excuses
    FROM course_members m
    JOIN courses c ON c.id = m.course_id
    WHERE m.user_id = ${instructorId} AND m.role_in_course = 'instructor'
    ORDER BY c.code`;
}

module.exports = {
  findSession,
  findOpenSessionOfCourse,
  findSessionByCode,
  openSession,
  closeSession,
  reopenSession,
  checkInsOfSession,
  countsOfSession,
  coursesOfInstructor
};
