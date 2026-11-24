const { getSql } = require('../shared/db');

function toInstructors(rows) {
  const instructors = [];
  for (const row of rows) {
    let instructor = instructors.find((i) => i.id === row.id);
    if (!instructor) {
      instructor = { id: row.id, fullName: row.full_name, email: row.email, courseIds: [], courses: [] };
      instructors.push(instructor);
    }
    if (row.course_id) {
      instructor.courseIds.push(row.course_id);
      instructor.courses.push({ id: row.course_id, code: row.course_code });
    }
  }
  return instructors;
}

function likePattern(search) {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

async function listInstructors(search) {
  const sql = getSql();
  const pattern = likePattern(search);
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, c.id AS course_id, c.code AS course_code
    FROM users u
    LEFT JOIN course_members m ON m.user_id = u.id
    LEFT JOIN courses c ON c.id = m.course_id
    WHERE u.role = 'instructor' AND (u.full_name ILIKE ${pattern} OR u.email ILIKE ${pattern})
    ORDER BY u.full_name, c.code`;
  return toInstructors(rows);
}

async function findInstructor(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, c.id AS course_id, c.code AS course_code
    FROM users u
    LEFT JOIN course_members m ON m.user_id = u.id
    LEFT JOIN courses c ON c.id = m.course_id
    WHERE u.id = ${id} AND u.role = 'instructor'
    ORDER BY c.code`;
  return toInstructors(rows)[0] || null;
}

async function emailTaken(email, exceptId = null) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM users WHERE email = ${email}`;
  return rows.some((row) => row.id !== exceptId);
}

async function missingCourseIds(courseIds) {
  const sql = getSql();
  const missing = [];
  for (const id of courseIds) {
    const rows = await sql`SELECT id FROM courses WHERE id = ${id}`;
    if (rows.length === 0) missing.push(id);
  }
  return missing;
}

async function setCourses(instructorId, courseIds) {
  const sql = getSql();
  await sql.transaction([
    sql`DELETE FROM course_members WHERE user_id = ${instructorId}`,
    ...courseIds.map((courseId) => sql`
      INSERT INTO course_members (course_id, user_id, role_in_course)
      VALUES (${courseId}, ${instructorId}, 'instructor')`)
  ]);
}

async function createInstructor({ fullName, email, passwordHash, courseIds }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES (${fullName}, ${email}, ${passwordHash}, 'instructor')
    RETURNING id`;
  const id = rows[0].id;
  await setCourses(id, courseIds);
  return findInstructor(id);
}

async function updateInstructor(id, { fullName, email, courseIds }) {
  const sql = getSql();
  if (fullName !== undefined) await sql`UPDATE users SET full_name = ${fullName} WHERE id = ${id}`;
  if (email !== undefined) await sql`UPDATE users SET email = ${email} WHERE id = ${id}`;
  if (courseIds !== undefined) await setCourses(id, courseIds);
  return findInstructor(id);
}

async function deleteInstructor(id) {
  const sql = getSql();
  const rows = await sql`DELETE FROM users WHERE id = ${id} AND role = 'instructor' RETURNING id`;
  return rows.length > 0;
}

module.exports = {
  listInstructors,
  findInstructor,
  emailTaken,
  missingCourseIds,
  createInstructor,
  updateInstructor,
  deleteInstructor
};
