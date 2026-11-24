const { sendError } = require('../shared/http');
const { parseId } = require('../shared/validate');
const { getCourseForUser } = require('../shared/courses');
const excuses = require('../services/excuses');
const { setExcuseStatus } = require('../services/otherServices');

const STATUSES = ['pending', 'approved', 'rejected'];

async function listCourseExcuses(req, res) {
  const courseId = parseId(req.params.courseId);
  if (!courseId) return sendError(res, 404, 'COURSE_NOT_FOUND', 'Course not found.');
  const status = req.query.status === undefined ? 'pending' : req.query.status;
  if (!STATUSES.includes(status)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Status must be pending, approved or rejected.');
  }

  const { course, problem } = await getCourseForUser(req.user, courseId);
  if (problem) return sendError(res, ...problem);

  return res.status(200).json(await excuses.listExcusesOfCourse(course.id, status));
}

async function reviewExcuse(req, res) {
  const decision = req.body?.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Decision must be approve or reject.');
  }

  const id = parseId(req.params.id);
  const excuse = id ? await excuses.findExcuse(id) : null;
  if (!excuse) return sendError(res, 404, 'EXCUSE_NOT_FOUND', 'Excuse not found.');

  const { problem } = await getCourseForUser(req.user, excuse.courseId);
  if (problem) return sendError(res, ...problem);
  if (excuse.status !== 'pending') {
    return sendError(res, 409, 'ALREADY_DECIDED', 'This excuse was already decided.');
  }

  let answer;
  try {
    answer = await setExcuseStatus(excuse.id, decision === 'approve' ? 'approved' : 'rejected', req.user.id);
  } catch (error) {
    console.error(`Excuse ${excuse.id} decision failed: ${error.message}`);
    return sendError(res, 502, 'STUDENT_SERVICE_UNAVAILABLE', 'The decision could not be saved. Try again in a minute.');
  }
  if (answer.status === 409) {
    return sendError(res, 409, 'ALREADY_DECIDED', 'This excuse was already decided.');
  }
  if (answer.status !== 200) {
    console.error(`Excuse ${excuse.id} decision: student service answered ${answer.status}.`);
    return sendError(res, 502, 'STUDENT_SERVICE_UNAVAILABLE', 'The decision could not be saved. Try again in a minute.');
  }

  return res.status(200).json(await excuses.findExcuse(excuse.id));
}

module.exports = { listCourseExcuses, reviewExcuse };
