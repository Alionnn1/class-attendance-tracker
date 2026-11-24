const { getSql } = require('../shared/db');

function toCourse(row, instructorNames) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    firstWarningAt: row.first_warning_at,
    secondWarningAt: row.second_warning_at,
    absenceLimit: row.absence_limit,
    studentCount: row.student_count,
    instructors: instructorNames[row.id] || [],
    sessionCount: row.session_count
  };
}

async function instructorNames() {
  const sql = getSql();
  const rows = await sql`
    SELECT m.course_id, u.full_name
    FROM course_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.role_in_course = 'instructor'
    ORDER BY u.full_name`;
  const names = {};
  for (const row of rows) {
    if (!names[row.course_id]) names[row.course_id] = [];
    names[row.course_id].push(row.full_name);
  }
  return names;
}

function likePattern(search) {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

async function listCourses(search) {
  const sql = getSql();
  const pattern = likePattern(search);
  const rows = await sql`
    SELECT c.id, c.code, c.name, c.first_warning_at, c.second_warning_at, c.absence_limit,
           (SELECT count(*)::int FROM course_members m
             WHERE m.course_id = c.id AND m.role_in_course = 'student') AS student_count,
           (SELECT count(*)::int FROM sessions s WHERE s.course_id = c.id) AS session_count
    FROM courses c
    WHERE c.code ILIKE ${pattern} OR c.name ILIKE ${pattern}
    ORDER BY c.code`;
  const names = await instructorNames();
  return rows.map((row) => toCourse(row, names));
}

async function findCourse(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.code, c.name, c.first_warning_at, c.second_warning_at, c.absence_limit,
           (SELECT count(*)::int FROM course_members m
             WHERE m.course_id = c.id AND m.role_in_course = 'student') AS student_count,
           (SELECT count(*)::int FROM sessions s WHERE s.course_id = c.id) AS session_count
    FROM courses c
    WHERE c.id = ${id}`;
  if (rows.length === 0) return null;
  return toCourse(rows[0], await instructorNames());
}

async function codeTaken(code) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM courses WHERE code = ${code}`;
  return rows.length > 0;
}

async function createCourse({ code, name, firstWarningAt, secondWarningAt, absenceLimit }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO courses (code, name, first_warning_at, second_warning_at, absence_limit)
    VALUES (${code}, ${name}, ${firstWarningAt}, ${secondWarningAt}, ${absenceLimit})
    RETURNING id`;
  return findCourse(rows[0].id);
}

async function updateCourse(id, { name, firstWarningAt, secondWarningAt, absenceLimit }) {
  const sql = getSql();
  await sql`
    UPDATE courses
    SET name = ${name}, first_warning_at = ${firstWarningAt},
        second_warning_at = ${secondWarningAt}, absence_limit = ${absenceLimit}
    WHERE id = ${id}`;
  return findCourse(id);
}

async function deleteCourse(id) {
  const sql = getSql();
  await sql`DELETE FROM courses WHERE id = ${id}`;
}

module.exports = { listCourses, findCourse, codeTaken, createCourse, updateCourse, deleteCourse };
