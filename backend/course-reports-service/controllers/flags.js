const { sendError } = require('../shared/http');
const { parseId } = require('../shared/validate');
const { getCourseForUser } = require('../shared/courses');
const { attendanceStatus, warningLevels } = require('../shared/policy');
const { attendanceTotals } = require('../services/studentService');
const { sendWarningEmail } = require('../services/email');
const warnings = require('../services/warnings');

const STATUS_ORDER = { barred: 0, second_warning: 1, first_warning: 2, safe: 3 };

async function courseFromUrl(req) {
  const courseId = parseId(req.params.courseId);
  if (!courseId) return { problem: [404, 'COURSE_NOT_FOUND', 'Course not found.'] };
  return getCourseForUser(req.user, courseId);
}

async function totalsOrNull(courseId) {
  try {
    return await attendanceTotals(courseId);
  } catch (error) {
    console.error(`Attendance totals of course ${courseId} failed: ${error.message}`);
    return null;
  }
}

async function getFlags(req, res) {
  const { course, problem } = await courseFromUrl(req);
  if (problem) return sendError(res, ...problem);

  const totals = await totalsOrNull(course.id);
  if (!totals) return sendError(res, 502, 'STUDENT_SERVICE_UNAVAILABLE', 'Attendance totals are not available right now. Try again in a minute.');
  const last = await warnings.lastWarnings(course.id);

  const flags = totals.map((t) => {
    const total = t.present + t.absent + t.excused;
    return {
      studentId: t.studentId,
      studentName: t.fullName,
      email: t.email,
      present: t.present,
      absent: t.absent,
      excused: t.excused,
      totalSessions: total,
      attendancePercent: total === 0 ? 100 : Math.round((t.present / total) * 100),
      firstWarningAt: course.first_warning_at,
      secondWarningAt: course.second_warning_at,
      absenceLimit: course.absence_limit,
      absencesRemaining: Math.max(course.absence_limit - t.absent, 0),
      status: attendanceStatus(t.absent, course),
      lastWarning: last.get(t.studentId) || null
    };
  });
  flags.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.absent - a.absent);
  return res.status(200).json(flags);
}

async function sendWarnings(req, res) {
  const { course, problem } = await courseFromUrl(req);
  if (problem) return sendError(res, ...problem);

  const totals = await totalsOrNull(course.id);
  if (!totals) return sendError(res, 502, 'STUDENT_SERVICE_UNAVAILABLE', 'Attendance totals are not available right now. Try again in a minute.');
  const alreadySent = await warnings.sentLevels(course.id);

  const sent = [];
  let failed = 0;
  for (const student of totals) {
    for (const level of warningLevels(student.absent, course)) {
      if (alreadySent.has(`${student.studentId}:${level}`)) continue;

      const email = await sendWarningEmail(level, student, course);
      if (!email.sent) {
        failed += 1;
        console.error(`Warning ${level} for student ${student.studentId}: ${email.result}`);
        continue;
      }
      const warning = await warnings.recordWarning(student.studentId, course.id, level, email.result);
      if (warning) sent.push({ ...warning, studentName: student.fullName });
    }
  }

  if (failed > 0 && sent.length === 0) {
    return sendError(res, 502, 'EMAIL_FAILED', 'The email service did not accept the warnings. They will be sent at the next check.');
  }
  return res.status(201).json(sent);
}

module.exports = { getFlags, sendWarnings };
