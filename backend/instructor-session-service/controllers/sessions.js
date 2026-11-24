const { sendError } = require('../shared/http');
const { isId, parseId } = require('../shared/validate');
const { getCourseForUser } = require('../shared/courses');
const sessions = require('../services/sessions');
const { markAbsences, sendDueWarnings } = require('../services/otherServices');

const MAX_MINUTES = 60;

function courseView(course) {
  return {
    id: course.id,
    code: course.code,
    name: course.name,
    firstWarningAt: course.first_warning_at,
    secondWarningAt: course.second_warning_at,
    absenceLimit: course.absence_limit
  };
}

const isExpired = (session) => Date.parse(session.expiresAt) <= Date.now();

async function closeAndRecord(session, course, token) {
  const closed = await sessions.closeSession(session.id);
  if (!closed) return null;

  try {
    await markAbsences(closed.id, course.id);
  } catch (error) {
    await sessions.reopenSession(closed.id);
    throw error;
  }

  const warningsSent = await sendDueWarnings(course.id, token);
  const { present, absent } = await sessions.countsOfSession(closed.id);
  const total = present + absent;
  return {
    session: { ...closed, courseCode: course.code, courseName: course.name },
    present,
    absent,
    attendanceRate: total === 0 ? 0 : Math.round((present / total) * 100),
    warningsSent
  };
}

async function closeIfExpired(session, course, token) {
  if (!session || !isExpired(session)) return session;
  try {
    await closeAndRecord(session, course, token);
    return null;
  } catch (error) {
    console.error(`Closing expired session ${session.id} failed: ${error.message}`);
    return session;
  }
}

async function myCourses(req, res) {
  const rows = await sessions.coursesOfInstructor(req.user.id);
  const courses = [];
  for (const row of rows) {
    const open = await sessions.findOpenSessionOfCourse(row.id);
    const stillOpen = await closeIfExpired(open, row, req.token);
    courses.push({ ...courseView(row), pendingExcuses: row.pending_excuses, openSession: stillOpen });
  }
  return res.status(200).json(courses);
}

async function openSession(req, res) {
  const { courseId, durationMinutes } = req.body ?? {};
  if (!isId(courseId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'courseId must be an id.');
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_MINUTES) {
    return sendError(res, 400, 'VALIDATION_ERROR', `Duration must be a whole number of minutes from 1 to ${MAX_MINUTES}.`, 'durationMinutes');
  }

  const { course, problem } = await getCourseForUser(req.user, courseId);
  if (problem) return sendError(res, ...problem);

  const alreadyOpen = await closeIfExpired(await sessions.findOpenSessionOfCourse(course.id), course, req.token);
  if (alreadyOpen) {
    return sendError(res, 409, 'SESSION_ALREADY_OPEN', 'This course already has an open session. Close it first.');
  }

  let session;
  try {
    session = await sessions.openSession(course.id, req.user.id, durationMinutes);
  } catch (error) {
    if (error.code === '23505') {
      return sendError(res, 409, 'SESSION_ALREADY_OPEN', 'This course already has an open session. Close it first.');
    }
    throw error;
  }
  return res.status(201).json({ ...session, courseCode: course.code, courseName: course.name });
}

async function findOwnSession(user, idText) {
  const id = parseId(idText);
  const session = id ? await sessions.findSession(id) : null;
  if (!session) return { problem: [404, 'SESSION_NOT_FOUND', 'Session not found.'] };
  const { course, problem } = await getCourseForUser(user, session.courseId);
  if (problem) return { problem };
  return { session, course };
}

async function getSession(req, res) {
  const { session, course, problem } = await findOwnSession(req.user, req.params.id);
  if (problem) return sendError(res, ...problem);

  const live = await sessions.checkInsOfSession(session.id, course.id);
  return res.status(200).json({ ...session, courseCode: course.code, courseName: course.name, ...live });
}

async function closeSession(req, res) {
  const { session, course, problem } = await findOwnSession(req.user, req.params.id);
  if (problem) return sendError(res, ...problem);

  if (session.status !== 'open') {
    return sendError(res, 409, 'SESSION_CLOSED', 'This session is already closed.');
  }

  let summary;
  try {
    summary = await closeAndRecord(session, course, req.token);
  } catch (error) {
    console.error(`Closing session ${session.id} failed: ${error.message}`);
    return sendError(res, 502, 'STUDENT_SERVICE_UNAVAILABLE', 'The absences could not be recorded, so the session is still open. Try again in a minute.');
  }
  if (!summary) {
    return sendError(res, 409, 'SESSION_CLOSED', 'This session is already closed.');
  }
  return res.status(200).json(summary);
}

async function findOpenByCode(req, res) {
  const code = typeof req.query.code === 'string' ? req.query.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{1,12}$/.test(code)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'code must be letters and digits.');
  }

  const session = await sessions.findSessionByCode(code);
  if (!session) return sendError(res, 404, 'SESSION_NOT_FOUND', 'No session has this code.');
  if (session.status !== 'open' || isExpired(session)) {
    return sendError(res, 410, 'SESSION_EXPIRED', 'This session is closed or has expired.');
  }
  return res.status(200).json({ id: session.id, courseId: session.courseId, expiresAt: session.expiresAt });
}

module.exports = { myCourses, openSession, getSession, closeSession, findOpenByCode };
