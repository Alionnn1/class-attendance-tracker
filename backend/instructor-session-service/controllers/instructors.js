const { sendError } = require('../shared/http');
const { checkText, checkEmail, checkPassword, normalizeEmail, parseId, checkIdList } = require('../shared/validate');
const { hashPassword } = require('../shared/auth/passwords');
const instructors = require('../services/instructors');

async function listInstructors(req, res) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Search text must contain at most 100 characters.');
  }
  return res.status(200).json(await instructors.listInstructors(search));
}

async function checkCourses(courseIds) {
  const problem = checkIdList(courseIds, 'Course ids');
  if (problem) return { status: 400, code: 'VALIDATION_ERROR', message: problem };
  const missing = await instructors.missingCourseIds(courseIds);
  if (missing.length > 0) {
    return { status: 404, code: 'COURSE_NOT_FOUND', message: `Course ${missing[0]} does not exist.` };
  }
  return null;
}

async function createInstructor(req, res) {
  const { fullName, email, password, courseIds = [] } = req.body ?? {};

  const nameProblem = checkText(fullName, 'Name', 1, 100);
  if (nameProblem) return sendError(res, 400, 'VALIDATION_ERROR', nameProblem, 'fullName');
  const emailProblem = checkEmail(email);
  if (emailProblem) return sendError(res, 400, 'VALIDATION_ERROR', emailProblem, 'email');
  const passwordProblem = checkPassword(password);
  if (passwordProblem) return sendError(res, 400, 'VALIDATION_ERROR', passwordProblem, 'password');
  const courseError = await checkCourses(courseIds);
  if (courseError) return sendError(res, courseError.status, courseError.code, courseError.message, 'courseIds');

  const cleanEmail = normalizeEmail(email);
  if (await instructors.emailTaken(cleanEmail)) {
    return sendError(res, 409, 'EMAIL_TAKEN', 'Another account already uses this email.', 'email');
  }

  const instructor = await instructors.createInstructor({
    fullName: fullName.trim(),
    email: cleanEmail,
    passwordHash: await hashPassword(password),
    courseIds: [...new Set(courseIds)]
  });
  return res.status(201).json(instructor);
}

async function updateInstructor(req, res) {
  const id = parseId(req.params.id);
  const instructor = id ? await instructors.findInstructor(id) : null;
  if (!instructor) return sendError(res, 404, 'INSTRUCTOR_NOT_FOUND', 'No instructor has this id.');

  const { fullName, email, courseIds } = req.body ?? {};
  if (fullName === undefined && email === undefined && courseIds === undefined) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Send at least one of fullName, email or courseIds.');
  }

  const changes = {};
  if (fullName !== undefined) {
    const problem = checkText(fullName, 'Name', 1, 100);
    if (problem) return sendError(res, 400, 'VALIDATION_ERROR', problem, 'fullName');
    changes.fullName = fullName.trim();
  }
  if (email !== undefined) {
    const problem = checkEmail(email);
    if (problem) return sendError(res, 400, 'VALIDATION_ERROR', problem, 'email');
    changes.email = normalizeEmail(email);
    if (await instructors.emailTaken(changes.email, id)) {
      return sendError(res, 409, 'EMAIL_TAKEN', 'Another account already uses this email.', 'email');
    }
  }
  if (courseIds !== undefined) {
    const courseError = await checkCourses(courseIds);
    if (courseError) return sendError(res, courseError.status, courseError.code, courseError.message, 'courseIds');
    changes.courseIds = [...new Set(courseIds)];
  }

  return res.status(200).json(await instructors.updateInstructor(id, changes));
}

async function deleteInstructor(req, res) {
  const id = parseId(req.params.id);
  const deleted = id ? await instructors.deleteInstructor(id) : false;
  if (!deleted) return sendError(res, 404, 'INSTRUCTOR_NOT_FOUND', 'No instructor has this id.');
  return res.status(204).end();
}

module.exports = { listInstructors, createInstructor, updateInstructor, deleteInstructor };
