const { getSql } = require('../shared/db');

function toRecord(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    courseId: row.course_id,
    status: row.status,
    checkedInAt: row.checked_in_at
  };
}

async function findEnrolledCourse(studentId, courseId) {
  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.code, c.name
    FROM course_members m
    JOIN courses c ON c.id = m.course_id
    WHERE m.user_id = ${studentId} AND m.course_id = ${courseId} AND m.role_in_course = 'student'`;
  return rows[0] || null;
}

async function recordCheckIn(studentId, session) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO attendance_records (session_id, student_id, course_id, status, checked_in_at)
    VALUES (${session.id}, ${studentId}, ${session.courseId}, 'present', now())
    ON CONFLICT (session_id, student_id) DO NOTHING
    RETURNING id, session_id, student_id, course_id, status, checked_in_at`;
  return rows[0] ? toRecord(rows[0]) : null;
}

async function sessionInCourse(sessionId, courseId) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM sessions WHERE id = ${sessionId} AND course_id = ${courseId}`;
  return rows.length > 0;
}

async function markAbsences(sessionId, courseId) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO attendance_records (session_id, student_id, course_id, status)
    SELECT ${sessionId}::int, m.user_id, ${courseId}::int, 'absent'
    FROM course_members m
    WHERE m.course_id = ${courseId} AND m.role_in_course = 'student'
    ON CONFLICT (session_id, student_id) DO NOTHING
    RETURNING id`;
  return rows.length;
}

async function courseTotalsOfStudent(studentId) {
  const sql = getSql();
  return sql`
    SELECT c.id, c.code, c.name, c.first_warning_at, c.second_warning_at, c.absence_limit,
           SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::int AS present,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent,
           SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END)::int AS excused
    FROM course_members m
    JOIN courses c ON c.id = m.course_id
    LEFT JOIN attendance_records a ON a.course_id = m.course_id AND a.student_id = m.user_id
    WHERE m.user_id = ${studentId} AND m.role_in_course = 'student'
    GROUP BY c.id
    ORDER BY c.code`;
}

async function studentTotalsOfCourse(courseId) {
  const sql = getSql();
  return sql`
    SELECT u.id, u.full_name, u.email,
           SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::int AS present,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent,
           SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END)::int AS excused
    FROM course_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN attendance_records a ON a.course_id = m.course_id AND a.student_id = m.user_id
    WHERE m.course_id = ${courseId} AND m.role_in_course = 'student'
    GROUP BY u.id
    ORDER BY u.full_name`;
}

async function listRecordsOfStudent(studentId) {
  const sql = getSql();
  const rows = await sql`
    SELECT a.id, a.session_id, a.student_id, a.course_id, a.status, a.checked_in_at,
           c.code AS course_code, c.name AS course_name,
           s.opened_at AS session_date,
           e.status AS excuse_status
    FROM attendance_records a
    JOIN courses c ON c.id = a.course_id
    JOIN sessions s ON s.id = a.session_id
    LEFT JOIN excuse_requests e ON e.attendance_record_id = a.id
    WHERE a.student_id = ${studentId}
    ORDER BY s.opened_at DESC`;

  return rows.map((row) => ({
    ...toRecord(row),
    courseCode: row.course_code,
    courseName: row.course_name,
    sessionDate: row.session_date,
    excuseStatus: row.excuse_status
  }));
}

module.exports = {
  findEnrolledCourse,
  recordCheckIn,
  sessionInCourse,
  markAbsences,
  courseTotalsOfStudent,
  studentTotalsOfCourse,
  listRecordsOfStudent
};
