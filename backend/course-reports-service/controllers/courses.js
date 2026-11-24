const { sendError } = require('../shared/http');
const { checkText, parseId } = require('../shared/validate');
const courses = require('../services/courses');

const MAX_LIMIT = 50;

function checkPolicy({ firstWarningAt, secondWarningAt, absenceLimit }) {
  if (!Number.isInteger(firstWarningAt) || firstWarningAt < 1) {
    return ['First warning must be a whole number of at least 1.', 'firstWarningAt'];
  }
  if (!Number.isInteger(secondWarningAt) || secondWarningAt <= firstWarningAt) {
    return ['Second warning must be a whole number above the first warning.', 'secondWarningAt'];
  }
  if (!Number.isInteger(absenceLimit) || absenceLimit < secondWarningAt || absenceLimit > MAX_LIMIT) {
    return [`Absences allowed must be at least the second warning and at most ${MAX_LIMIT}.`, 'absenceLimit'];
  }
  return null;
}

async function listCourses(req, res) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Search text must contain at most 100 characters.');
  }
  return res.status(200).json(await courses.listCourses(search));
}

async function getCourse(req, res) {
  const id = parseId(req.params.id);
  const course = id ? await courses.findCourse(id) : null;
  if (!course) return sendError(res, 404, 'COURSE_NOT_FOUND', 'Course not found.');
  return res.status(200).json(course);
}

async function createCourse(req, res) {
  const { code, name, firstWarningAt, secondWarningAt, absenceLimit } = req.body ?? {};

  const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{2,12}$/.test(cleanCode)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Code must be 2 to 12 letters or digits.', 'code');
  }
  const nameProblem = checkText(name, 'Name', 1, 100);
  if (nameProblem) return sendError(res, 400, 'VALIDATION_ERROR', nameProblem, 'name');
  const policyProblem = checkPolicy({ firstWarningAt, secondWarningAt, absenceLimit });
  if (policyProblem) return sendError(res, 400, 'VALIDATION_ERROR', ...policyProblem);
  if (await courses.codeTaken(cleanCode)) {
    return sendError(res, 409, 'COURSE_CODE_TAKEN', 'Another course already uses this code.', 'code');
  }

  const course = await courses.createCourse({
    code: cleanCode, name: name.trim(), firstWarningAt, secondWarningAt, absenceLimit
  });
  return res.status(201).json(course);
}

async function updateCourse(req, res) {
  const id = parseId(req.params.id);
  const course = id ? await courses.findCourse(id) : null;
  if (!course) return sendError(res, 404, 'COURSE_NOT_FOUND', 'Course not found.');

  const { name, firstWarningAt, secondWarningAt, absenceLimit } = req.body ?? {};
  if (name !== undefined) {
    const problem = checkText(name, 'Name', 1, 100);
    if (problem) return sendError(res, 400, 'VALIDATION_ERROR', problem, 'name');
  }
  const changed = {
    name: name === undefined ? course.name : name.trim(),
    firstWarningAt: firstWarningAt ?? course.firstWarningAt,
    secondWarningAt: secondWarningAt ?? course.secondWarningAt,
    absenceLimit: absenceLimit ?? course.absenceLimit
  };
  const policyProblem = checkPolicy(changed);
  if (policyProblem) return sendError(res, 400, 'VALIDATION_ERROR', ...policyProblem);

  return res.status(200).json(await courses.updateCourse(id, changed));
}

async function deleteCourse(req, res) {
  const id = parseId(req.params.id);
  const course = id ? await courses.findCourse(id) : null;
  if (!course) return sendError(res, 404, 'COURSE_NOT_FOUND', 'Course not found.');

  await courses.deleteCourse(id);
  return res.status(204).end();
}

module.exports = { listCourses, getCourse, createCourse, updateCourse, deleteCourse };
