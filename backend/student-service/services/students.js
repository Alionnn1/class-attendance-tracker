const { getSql } = require('../shared/db');

function toStudents(rows) {
  const students = [];
  for (const row of rows) {
    let student = students.find((s) => s.id === row.id);
    if (!student) {
      student = { id: row.id, fullName: row.full_name, email: row.email, courseIds: [], courses: [] };
      students.push(student);
    }
    if (row.course_id) {
      student.courseIds.push(row.course_id);
      student.courses.push({ id: row.course_id, code: row.course_code });
    }
  }
  return students;
}

function likePattern(search) {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

async function listStudents(search, courseId) {
  const sql = getSql();
  const pattern = likePattern(search);
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, c.id AS course_id, c.code AS course_code
    FROM users u
    LEFT JOIN course_members m ON m.user_id = u.id
    LEFT JOIN courses c ON c.id = m.course_id
    WHERE u.role = 'student' AND (u.full_name ILIKE ${pattern} OR u.email ILIKE ${pattern})
    ORDER BY u.full_name, c.code`;
  const students = toStudents(rows);
  if (courseId) return students.filter((s) => s.courseIds.includes(courseId));
  return students;
}

async function findStudent(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, c.id AS course_id, c.code AS course_code
    FROM users u
    LEFT JOIN course_members m ON m.user_id = u.id
    LEFT JOIN courses c ON c.id = m.course_id
    WHERE u.id = ${id} AND u.role = 'student'
    ORDER BY c.code`;
  return toStudents(rows)[0] || null;
}

async function emailTaken(email, exceptId = null) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM users WHERE email = ${email}`;
  return rows.some((row) => row.id !== exceptId);
}

async function courseExists(courseId) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM courses WHERE id = ${courseId}`;
  return rows.length > 0;
}

async function missingCourseIds(courseIds) {
  const missing = [];
  for (const id of courseIds) {
    if (!(await courseExists(id))) missing.push(id);
  }
  return missing;
}

async function setCourses(studentId, courseIds) {
  const sql = getSql();
  await sql.transaction([
    sql`DELETE FROM course_members WHERE user_id = ${studentId}`,
    ...courseIds.map((courseId) => sql`
      INSERT INTO course_members (course_id, user_id, role_in_course)
      VALUES (${courseId}, ${studentId}, 'student')`)
  ]);
}

async function createStudent({ fullName, email, passwordHash, courseIds }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES (${fullName}, ${email}, ${passwordHash}, 'student')
    RETURNING id`;
  const id = rows[0].id;
  await setCourses(id, courseIds);
  return findStudent(id);
}

async function updateStudent(id, { fullName, email, courseIds }) {
  const sql = getSql();
  if (fullName !== undefined) await sql`UPDATE users SET full_name = ${fullName} WHERE id = ${id}`;
  if (email !== undefined) await sql`UPDATE users SET email = ${email} WHERE id = ${id}`;
  if (courseIds !== undefined) await setCourses(id, courseIds);
  return findStudent(id);
}

async function deleteStudent(id) {
  const sql = getSql();
  const rows = await sql`DELETE FROM users WHERE id = ${id} AND role = 'student' RETURNING id`;
  return rows.length > 0;
}

module.exports = {
  listStudents,
  findStudent,
  emailTaken,
  courseExists,
  missingCourseIds,
  createStudent,
  updateStudent,
  deleteStudent
};
