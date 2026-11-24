const { sendError } = require('../shared/http');
const { isId, parseId } = require('../shared/validate');
const { attendanceStatus } = require('../shared/policy');
const attendance = require('../services/attendance');
const { courseExists } = require('../services/students');
const { findOpenSession } = require('../services/sessionService');

const CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

async function checkIn(req, res) {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!code) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Enter the session code.', 'code');
  }
  if (!CODE_PATTERN.test(code)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'The code has only letters and numbers.', 'code');
  }

  let lookup;
  try {
    lookup = await findOpenSession(code);
  } catch (error) {
    console.error('Session lookup failed:', error.message);
    return sendError(res, 502, 'SESSION_SERVICE_UNAVAILABLE', 'Check-in is not available right now. Try again in a minute.');
  }
  if (lookup.status === 404) {
    return sendError(res, 404, 'SESSION_NOT_FOUND', 'No open session has this code. Check the code on the screen.', 'code');
  }
  const session = lookup.session;
  if (lookup.status === 410 || Date.parse(session.expiresAt) <= Date.now()) {
    return sendError(res, 410, 'SESSION_EXPIRED', 'This code has expired. Ask your instructor.', 'code');
  }

  const course = await attendance.findEnrolledCourse(req.user.id, session.courseId);
  if (!course) {
    return sendError(res, 403, 'NOT_ENROLLED', 'You are not enrolled in the course of this session.', 'code');
  }

  const record = await attendance.recordCheckIn(req.user.id, session);
  if (!record) {
    return sendError(res, 409, 'ALREADY_CHECKED_IN', 'You have already checked in to this session.', 'code');
  }

  return res.status(201).json({ ...record, courseCode: course.code, courseName: course.name });
}

async function mySummary(req, res) {
  const rows = await attendance.courseTotalsOfStudent(req.user.id);

  const summary = rows.map((row) => {
    const total = row.present + row.absent + row.excused;
    return {
      courseId: row.id,
      courseCode: row.code,
      courseName: row.name,
      present: row.present,
      absent: row.absent,
      excused: row.excused,
      totalSessions: total,
      attendancePercent: total === 0 ? 100 : Math.round((row.present / total) * 100),
      firstWarningAt: row.first_warning_at,
      secondWarningAt: row.second_warning_at,
      absenceLimit: row.absence_limit,
      absencesRemaining: Math.max(row.absence_limit - row.absent, 0),
      status: attendanceStatus(row.absent, row)
    };
  });

  return res.status(200).json(summary);
}

async function myAttendance(req, res) {
  return res.status(200).json(await attendance.listRecordsOfStudent(req.user.id));
}

async function markAbsences(req, res) {
  const { sessionId, courseId } = req.body ?? {};
  if (!isId(sessionId) || !isId(courseId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'sessionId and courseId must be ids.');
  }
  if (!(await attendance.sessionInCourse(sessionId, courseId))) {
    return sendError(res, 404, 'SESSION_NOT_FOUND', 'No session with this id in this course.');
  }

  const markedAbsent = await attendance.markAbsences(sessionId, courseId);
  return res.status(201).json({ sessionId, courseId, markedAbsent });
}

async function courseTotals(req, res) {
  const courseId = parseId(req.params.courseId);
  if (!courseId || !(await courseExists(courseId))) {
    return sendError(res, 404, 'COURSE_NOT_FOUND', 'Course not found.');
  }

  const rows = await attendance.studentTotalsOfCourse(courseId);
  return res.status(200).json(rows.map((row) => ({
    studentId: row.id,
    fullName: row.full_name,
    email: row.email,
    present: row.present,
    absent: row.absent,
    excused: row.excused
  })));
}

module.exports = { checkIn, mySummary, myAttendance, markAbsences, courseTotals };
