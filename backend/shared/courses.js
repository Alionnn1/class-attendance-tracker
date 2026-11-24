const { getSql } = require('./db');

async function getCourseForUser(user, courseId) {
  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.code, c.name, c.first_warning_at, c.second_warning_at, c.absence_limit,
           EXISTS (
             SELECT 1 FROM course_members m
             WHERE m.course_id = c.id AND m.user_id = ${user.id} AND m.role_in_course = 'instructor'
           ) AS teaches
    FROM courses c
    WHERE c.id = ${courseId}`;

  const course = rows[0];
  if (!course) return { problem: [404, 'COURSE_NOT_FOUND', 'Course not found.'] };
  if (user.role !== 'admin' && !course.teaches) {
    return { problem: [403, 'NOT_YOUR_COURSE', 'You do not teach this course.'] };
  }
  return { course };
}

module.exports = { getCourseForUser };
