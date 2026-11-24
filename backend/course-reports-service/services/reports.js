const { getSql } = require('../shared/db');

function toReport(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseCode: row.course_code,
    scope: row.scope,
    format: row.format,
    fileKey: row.file_key,
    createdBy: row.created_by,
    createdByName: row.created_by_name || '-',
    createdAt: row.created_at
  };
}

async function createReport({ courseId, scope, format, fileKey, createdBy }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO reports (course_id, scope, format, file_key, created_by)
    VALUES (${courseId}, ${scope}, ${format}, ${fileKey}, ${createdBy})
    RETURNING id`;
  return findReport(rows[0].id);
}

async function findReport(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT r.*, c.code AS course_code, u.full_name AS created_by_name
    FROM reports r
    JOIN courses c ON c.id = r.course_id
    LEFT JOIN users u ON u.id = r.created_by
    WHERE r.id = ${id}`;
  return rows[0] ? toReport(rows[0]) : null;
}

async function listReports(user, courseId) {
  const sql = getSql();
  let rows;
  if (user.role === 'admin') {
    rows = await sql`
      SELECT r.*, c.code AS course_code, u.full_name AS created_by_name
      FROM reports r
      JOIN courses c ON c.id = r.course_id
      LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.created_at DESC`;
  } else {
    rows = await sql`
      SELECT r.*, c.code AS course_code, u.full_name AS created_by_name
      FROM reports r
      JOIN courses c ON c.id = r.course_id
      JOIN course_members m ON m.course_id = r.course_id AND m.user_id = ${user.id} AND m.role_in_course = 'instructor'
      LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.created_at DESC`;
  }
  const reports = rows.map(toReport);
  if (courseId) return reports.filter((r) => r.courseId === courseId);
  return reports;
}

async function sessionRows(courseId) {
  const sql = getSql();
  const rows = await sql`
    SELECT s.opened_at, s.code,
           SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::int AS present,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent,
           SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END)::int AS excused
    FROM sessions s
    LEFT JOIN attendance_records a ON a.session_id = s.id
    WHERE s.course_id = ${courseId} AND s.status = 'closed'
    GROUP BY s.id
    ORDER BY s.opened_at`;
  return rows.map((row) => {
    const total = row.present + row.absent + row.excused;
    return {
      date: row.opened_at,
      code: row.code,
      present: row.present,
      absent: row.absent,
      excused: row.excused,
      attendanceRate: total === 0 ? 0 : Math.round((row.present / total) * 100)
    };
  });
}

async function studentRows(courseId) {
  const sql = getSql();
  const rows = await sql`
    SELECT u.full_name, u.email, s.opened_at, a.status, a.checked_in_at
    FROM attendance_records a
    JOIN users u ON u.id = a.student_id
    JOIN sessions s ON s.id = a.session_id
    WHERE a.course_id = ${courseId}
    ORDER BY u.full_name, s.opened_at`;
  return rows.map((row) => ({
    student: row.full_name,
    email: row.email,
    date: row.opened_at,
    status: row.status,
    checkedInAt: row.checked_in_at || ''
  }));
}

module.exports = { createReport, findReport, listReports, sessionRows, studentRows };
