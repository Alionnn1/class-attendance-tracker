const { getSql } = require('../shared/db');

function toExcuse(row) {
  return {
    id: row.id,
    attendanceRecordId: row.attendance_record_id,
    studentId: row.student_id,
    studentName: row.full_name,
    studentEmail: row.email,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    courseId: row.course_id,
    courseCode: row.course_code,
    sessionDate: row.session_date
  };
}

async function listExcusesOfCourse(courseId, status) {
  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.attendance_record_id, e.student_id, u.full_name, u.email, e.reason, e.status,
           e.created_at, e.reviewed_at, a.course_id, c.code AS course_code, s.opened_at AS session_date
    FROM excuse_requests e
    JOIN users u ON u.id = e.student_id
    JOIN attendance_records a ON a.id = e.attendance_record_id
    JOIN courses c ON c.id = a.course_id
    JOIN sessions s ON s.id = a.session_id
    WHERE a.course_id = ${courseId} AND e.status = ${status}
    ORDER BY e.created_at DESC`;
  return rows.map(toExcuse);
}

async function findExcuse(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.attendance_record_id, e.student_id, u.full_name, u.email, e.reason, e.status,
           e.created_at, e.reviewed_at, a.course_id, c.code AS course_code, s.opened_at AS session_date
    FROM excuse_requests e
    JOIN users u ON u.id = e.student_id
    JOIN attendance_records a ON a.id = e.attendance_record_id
    JOIN courses c ON c.id = a.course_id
    JOIN sessions s ON s.id = a.session_id
    WHERE e.id = ${id}`;
  return rows[0] ? toExcuse(rows[0]) : null;
}

module.exports = { listExcusesOfCourse, findExcuse };
