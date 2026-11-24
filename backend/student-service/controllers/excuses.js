const { sendError } = require('../shared/http');
const { checkText, isId, parseId } = require('../shared/validate');
const excuses = require('../services/excuses');

async function submitExcuse(req, res) {
  const { attendanceRecordId, reason } = req.body ?? {};

  const reasonProblem = checkText(reason, 'Reason', 1, 500);
  if (reasonProblem) return sendError(res, 400, 'VALIDATION_ERROR', reasonProblem, 'reason');
  if (!isId(attendanceRecordId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'attendanceRecordId must be an id.');
  }

  const record = await excuses.findRecordForExcuse(attendanceRecordId);
  if (!record) return sendError(res, 404, 'RECORD_NOT_FOUND', 'Attendance record not found.');
  if (record.student_id !== req.user.id) {
    return sendError(res, 403, 'FORBIDDEN', 'This attendance record is not yours.');
  }
  if (record.status !== 'absent') {
    return sendError(res, 409, 'NOT_ABSENT', 'You can only excuse a session marked absent.');
  }
  if (record.excuse_id) {
    return sendError(res, 409, 'EXCUSE_EXISTS', 'You already sent an excuse for this absence.');
  }

  const excuse = await excuses.createExcuse(record.id, req.user.id, reason.trim());
  if (!excuse) {
    return sendError(res, 409, 'EXCUSE_EXISTS', 'You already sent an excuse for this absence.');
  }
  return res.status(201).json(excuse);
}

async function myExcuses(req, res) {
  return res.status(200).json(await excuses.listExcusesOfStudent(req.user.id));
}

async function setExcuseStatus(req, res) {
  const { decision, reviewerId = null } = req.body ?? {};
  if (decision !== 'approved' && decision !== 'rejected') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'decision must be "approved" or "rejected".');
  }
  if (reviewerId !== null && !isId(reviewerId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'reviewerId must be an id.');
  }

  const id = parseId(req.params.id);
  const excuse = id ? await excuses.findExcuse(id) : null;
  if (!excuse) return sendError(res, 404, 'EXCUSE_NOT_FOUND', 'Excuse not found.');
  if (excuse.status !== 'pending') {
    return sendError(res, 409, 'EXCUSE_DECIDED', 'This excuse has already been decided.');
  }

  const decided = await excuses.decideExcuse(id, decision, reviewerId);
  if (!decided) {
    return sendError(res, 409, 'EXCUSE_DECIDED', 'This excuse has already been decided.');
  }
  return res.status(200).json(await excuses.findExcuse(id));
}

module.exports = { submitExcuse, myExcuses, setExcuseStatus };
