const { getSql } = require('../shared/db');

function toExcuse(row) {
  return {
    id: row.id,
    attendanceRecordId: row.attendance_record_id,
    studentId: row.student_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    sessionDate: row.session_date
  };
}

async function listExcusesOfStudent(studentId) {
  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.attendance_record_id, e.student_id, e.reason, e.status, e.created_at, e.reviewed_at,
           a.course_id, c.code AS course_code, c.name AS course_name, s.opened_at AS session_date
    FROM excuse_requests e
    JOIN attendance_records a ON a.id = e.attendance_record_id
    JOIN courses c ON c.id = a.course_id
    JOIN sessions s ON s.id = a.session_id
    WHERE e.student_id = ${studentId}
    ORDER BY e.created_at DESC`;
  return rows.map(toExcuse);
}

async function findExcuse(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.attendance_record_id, e.student_id, e.reason, e.status, e.created_at, e.reviewed_at,
           a.course_id, c.code AS course_code, c.name AS course_name, s.opened_at AS session_date
    FROM excuse_requests e
    JOIN attendance_records a ON a.id = e.attendance_record_id
    JOIN courses c ON c.id = a.course_id
    JOIN sessions s ON s.id = a.session_id
    WHERE e.id = ${id}`;
  return rows[0] ? toExcuse(rows[0]) : null;
}

async function findRecordForExcuse(recordId) {
  const sql = getSql();
  const rows = await sql`
    SELECT a.id, a.student_id, a.status, e.id AS excuse_id
    FROM attendance_records a
    LEFT JOIN excuse_requests e ON e.attendance_record_id = a.id
    WHERE a.id = ${recordId}`;
  return rows[0] || null;
}

async function createExcuse(recordId, studentId, reason) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO excuse_requests (attendance_record_id, student_id, reason)
    VALUES (${recordId}, ${studentId}, ${reason})
    ON CONFLICT (attendance_record_id) DO NOTHING
    RETURNING id`;
  return rows[0] ? findExcuse(rows[0].id) : null;
}

async function decideExcuse(id, decision, reviewerId) {
  const sql = getSql();
  const [decided] = await sql.transaction([
    sql`
      UPDATE excuse_requests
      SET status = ${decision}, reviewed_by = ${reviewerId}, reviewed_at = now()
      WHERE id = ${id} AND status = 'pending'
      RETURNING id`,
    sql`
      UPDATE attendance_records
      SET status = 'excused'
      WHERE id = (SELECT attendance_record_id FROM excuse_requests WHERE id = ${id} AND status = 'approved')`
  ]);
  return decided.length > 0;
}

module.exports = {
  listExcusesOfStudent,
  findExcuse,
  findRecordForExcuse,
  createExcuse,
  decideExcuse
};
